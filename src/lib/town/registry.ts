import fs from "node:fs";
import path from "node:path";
import { accessDenied, canAccess, DENIED_PREFIX, normalizeAccess } from "./access";
import { getDb, now } from "./db";
import { toolsDir } from "./paths";
import { readSchema, runScript } from "./runner";
import { validateInputs, type JsonSchema } from "./schema";
import type { Check, ErrorCode, Failure, Identity, RunRecord, ToolDetail, ToolSummary } from "./types";

const MAX_SOURCE_BYTES = 64 * 1024;

export const fail = (code: ErrorCode, error: string): Failure => ({ ok: false, code, error });

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Writes a version's source to disk so it can be run. Returns the file path. */
export function materialize(toolId: string, version: number, source: string): string {
  const dir = path.join(toolsDir(), toolId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `v${version}.py`);
  fs.writeFileSync(file, source, { mode: 0o600 });
  return file;
}

type ToolRow = {
  id: string;
  name: string;
  description: string;
  owner: string;
  touches: string;
  access: string;
  checks: string;
  latest_version: number;
  created_at: string;
};

const toSummary = (r: ToolRow): ToolSummary => ({
  id: r.id,
  name: r.name,
  description: r.description,
  owner: r.owner,
  touches: JSON.parse(r.touches) as string[],
  access: JSON.parse(r.access) as string[],
  latestVersion: r.latest_version,
  createdAt: r.created_at,
});

export type PublishArgs = {
  name: string;
  description: string;
  owner?: string;
  touches?: string[];
  /** Departments allowed to use the tool. Omit or leave empty for everyone. */
  access?: string[];
  source: string;
  checks?: Check;
};

export async function publishTool(args: PublishArgs, identity: Identity): Promise<{ ok: true; tool: ToolDetail } | Failure> {
  const name = args.name?.trim();
  if (!name) return fail("invalid_request", "name is required");
  if (!args.description || args.description.trim().length < 10)
    return fail("invalid_request", "description is required (at least 10 characters): say what the tool does.");
  if (!args.source || !args.source.trim()) return fail("invalid_request", "source is required");
  if (Buffer.byteLength(args.source) > MAX_SOURCE_BYTES) return fail("invalid_request", "source is larger than 64 KB");
  const access = normalizeAccess(args.access);
  if (!access.ok) return fail("invalid_request", access.error);
  const id = slugify(name);
  if (!id) return fail("invalid_request", "name must contain letters or numbers");
  const db = getDb();
  if (db.prepare("SELECT 1 FROM tools WHERE id = ?").get(id)) {
    return fail("conflict", `A tool named "${id}" already exists. To change it, use request_change instead of publishing again.`);
  }
  const file = materialize(id, 1, args.source);
  const schemaRes = await readSchema(file);
  if (!schemaRes.ok) {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
    return fail(
      "contract_violation",
      `${schemaRes.error} A Town Hall tool is a Python script that (1) reads its JSON inputs on stdin, (2) writes its JSON result to stdout, (3) prints its own JSON Schema when run with --schema, and (4) on failure prints {"error": "..."} and exits non-zero.`,
    );
  }
  for (const fx of args.checks?.fixtures ?? []) {
    const v = validateInputs(schemaRes.schema, fx.inputs);
    if (!v.ok) {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
      return fail("invalid_request", `A fixture's inputs do not match the tool's schema: ${v.error}`);
    }
  }
  const ts = now();
  db.prepare("INSERT INTO tools (id, name, description, owner, touches, access, checks, latest_version, created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(
    id,
    name,
    args.description.trim(),
    args.owner?.trim() || identity.user,
    JSON.stringify(args.touches ?? []),
    JSON.stringify(access.access),
    JSON.stringify(args.checks ?? {}),
    1,
    ts,
  );
  db.prepare("INSERT INTO versions (tool_id, version, source, schema_json, created_at) VALUES (?,?,?,?,?)").run(
    id,
    1,
    args.source,
    JSON.stringify(schemaRes.schema),
    ts,
  );
  return { ok: true, tool: getToolOrThrow(id) };
}

export function getToolOrThrow(id: string): ToolDetail {
  const t = getTool(id);
  if (!t) throw new Error(`tool ${id} not found`);
  return t;
}

export function getTool(id: string): ToolDetail | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM tools WHERE id = ?").get(id) as ToolRow | undefined;
  if (!row) return null;
  const latest = db
    .prepare("SELECT schema_json FROM versions WHERE tool_id = ? AND version = ?")
    .get(id, row.latest_version) as { schema_json: string };
  const versions = db
    .prepare("SELECT version, created_at FROM versions WHERE tool_id = ? ORDER BY version")
    .all(id) as { version: number; created_at: string }[];
  return {
    ...toSummary(row),
    inputSchema: JSON.parse(latest.schema_json),
    versions: versions.map((v) => ({ version: v.version, createdAt: v.created_at })),
    checks: JSON.parse(row.checks) as Check,
  };
}

export function getVersion(toolId: string, version: number): { source: string; schema: JsonSchema } | null {
  const row = getDb().prepare("SELECT source, schema_json FROM versions WHERE tool_id = ? AND version = ?").get(toolId, version) as
    | { source: string; schema_json: string }
    | undefined;
  return row ? { source: row.source, schema: JSON.parse(row.schema_json) as JsonSchema } : null;
}

/**
 * A tool as seen by one person: not_found, forbidden, or the tool. Use this at every boundary a
 * person or agent reaches (MCP, pages); getTool itself is unfiltered, for internal use.
 */
export function getToolFor(id: string, identity: Identity): { ok: true; tool: ToolDetail } | Failure {
  const tool = getTool(id);
  if (!tool) return fail("not_found", `No tool with id "${id}". Use search_tools to find one.`);
  if (!canAccess(identity, tool)) return accessDenied(identity, tool);
  return { ok: true, tool };
}

/** searchTools limited to the tools this person may use. */
export function searchToolsFor(identity: Identity, query?: string): ToolSummary[] {
  return searchTools(query).filter((t) => canAccess(identity, t));
}

/** Plain text match over name and description, across every tool (unfiltered). An empty query lists every tool. */
export function searchTools(query?: string): ToolSummary[] {
  const rows = getDb().prepare("SELECT * FROM tools ORDER BY created_at DESC").all() as ToolRow[];
  const q = query?.trim().toLowerCase();
  const all = rows.map(toSummary);
  if (!q) return all;
  const words = q.split(/\s+/);
  return all.filter((t) => {
    const hay = `${t.id} ${t.name} ${t.description} ${t.touches.join(" ")}`.toLowerCase();
    return words.some((w) => hay.includes(w));
  });
}

export type RunToolResult =
  | { ok: true; toolId: string; version: number; output: unknown; durationMs: number }
  | (Failure & { toolId?: string; version?: number });

function audit(
  identity: Identity,
  toolId: string,
  version: number,
  inputs: unknown,
  ok: boolean,
  output: unknown,
  error: string | null,
  durationMs: number,
) {
  getDb()
    .prepare("INSERT INTO runs (tool_id, version, person, agent, inputs, ok, output, error, duration_ms, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(toolId, version, identity.user, identity.agent, JSON.stringify(inputs ?? null), ok ? 1 : 0, ok ? JSON.stringify(output) : null, error, durationMs, now());
}

export async function runTool(
  args: { id: string; version?: number; inputs: unknown },
  identity: Identity,
): Promise<RunToolResult> {
  const tool = getTool(args.id);
  if (!tool) return { ...fail("not_found", `No tool with id "${args.id}". Use search_tools to find one.`) };
  if (!canAccess(identity, tool)) {
    const denied = accessDenied(identity, tool);
    audit(identity, tool.id, args.version ?? tool.latestVersion, args.inputs, false, null, denied.error, 0);
    return { ...denied, toolId: tool.id };
  }
  const version = args.version ?? tool.latestVersion;
  const v = getVersion(tool.id, version);
  if (!v) return { ...fail("not_found", `Tool "${tool.id}" has no version ${version}. Versions: ${tool.versions.map((x) => x.version).join(", ")}.`), toolId: tool.id };
  const valid = validateInputs(v.schema, args.inputs ?? {});
  if (!valid.ok) {
    audit(identity, tool.id, version, args.inputs, false, null, valid.error, 0);
    return { ...fail("invalid_inputs", valid.error), toolId: tool.id, version };
  }
  const file = materialize(tool.id, version, v.source);
  const res = await runScript(file, args.inputs ?? {});
  if (!res.ok) {
    audit(identity, tool.id, version, args.inputs, false, null, res.error, res.durationMs);
    return { ...fail("tool_failed", res.error), toolId: tool.id, version };
  }
  audit(identity, tool.id, version, args.inputs, true, res.output, null, res.durationMs);
  return { ok: true, toolId: tool.id, version, output: res.output, durationMs: res.durationMs };
}

type RunRow = {
  id: number;
  tool_id: string;
  version: number;
  person: string;
  agent: string;
  inputs: string;
  ok: number;
  output: string | null;
  error: string | null;
  duration_ms: number;
  created_at: string;
};

export function listRuns(limit = 50, toolId?: string): RunRecord[] {
  const db = getDb();
  const rows = (toolId
    ? db.prepare("SELECT * FROM runs WHERE tool_id = ? ORDER BY id DESC LIMIT ?").all(toolId, limit)
    : db.prepare("SELECT * FROM runs ORDER BY id DESC LIMIT ?").all(limit)) as RunRow[];
  return rows.map((r) => ({
    id: r.id,
    toolId: r.tool_id,
    version: r.version,
    person: r.person,
    agent: r.agent,
    inputs: JSON.parse(r.inputs),
    ok: r.ok === 1,
    denied: r.ok !== 1 && (r.error ?? "").startsWith(DENIED_PREFIX),
    output: r.output ? JSON.parse(r.output) : null,
    error: r.error,
    durationMs: r.duration_ms,
    createdAt: r.created_at,
  }));
}
