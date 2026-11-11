import { randomUUID } from "node:crypto";
import { createTwoFilesPatch } from "diff";
import { getDb, now } from "./db";
import { runDeployGate, type GateResult } from "./gate";
import { materialize, fail, getTool, getVersion } from "./registry";
import { readSchema } from "./runner";
import { reviewWithCreator, type CreatorResult } from "./creator";
import type { Failure, Identity } from "./types";

export type ChangeStatus = "reviewing" | "deployed" | "rejected" | "gate_failed" | "error";

export type ChangeRecord = {
  id: string;
  toolId: string;
  requester: Identity;
  need: string;
  status: ChangeStatus;
  decision: "accept" | "reject" | null;
  reason: string | null;
  fromVersion: number;
  toVersion: number | null;
  diff: string | null;
  gate: GateResult | null;
  backend: string | null;
  cached: boolean;
  notes: string[];
  createdAt: string;
  updatedAt: string;
};

type ChangeRow = {
  id: string;
  tool_id: string;
  requester_user: string;
  requester_agent: string;
  need: string;
  status: ChangeStatus;
  decision: "accept" | "reject" | null;
  reason: string | null;
  from_version: number;
  to_version: number | null;
  new_source: string | null;
  diff: string | null;
  gate_json: string | null;
  backend: string | null;
  cached: number;
  created_at: string;
  updated_at: string;
};

function toRecord(r: ChangeRow): ChangeRecord {
  const extra = r.gate_json ? (JSON.parse(r.gate_json) as { gate: GateResult | null; notes: string[] }) : { gate: null, notes: [] };
  return {
    id: r.id,
    toolId: r.tool_id,
    requester: { user: r.requester_user, agent: r.requester_agent },
    need: r.need,
    status: r.status,
    decision: r.decision,
    reason: r.reason,
    fromVersion: r.from_version,
    toVersion: r.to_version,
    diff: r.diff,
    gate: extra.gate,
    backend: r.backend,
    cached: r.cached === 1,
    notes: extra.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function getChange(id: string): ChangeRecord | null {
  const row = getDb().prepare("SELECT * FROM changes WHERE id = ?").get(id) as ChangeRow | undefined;
  return row ? toRecord(row) : null;
}

export function listChanges(limit = 50, toolId?: string): ChangeRecord[] {
  const db = getDb();
  const rows = (toolId
    ? db.prepare("SELECT * FROM changes WHERE tool_id = ? ORDER BY created_at DESC LIMIT ?").all(toolId, limit)
    : db.prepare("SELECT * FROM changes ORDER BY created_at DESC LIMIT ?").all(limit)) as ChangeRow[];
  return rows.map(toRecord);
}

function update(id: string, fields: Partial<Record<string, string | number | null>>) {
  const keys = Object.keys(fields);
  getDb()
    .prepare(`UPDATE changes SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
    .run(...keys.map((k) => fields[k] as string | number | null), now(), id);
}

// One change at a time per tool, so two requests can never race to the same version number.
const locks = new Map<string, Promise<unknown>>();
async function withToolLock<T>(toolId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(toolId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(toolId, next.catch(() => {}));
  return next;
}

export type RequestChangeOptions = { creator?: typeof reviewWithCreator; timeoutMs?: number };

/**
 * A colleague's agent asks for a change. The creator agent decides; if it accepts, the
 * platform runs the deploy gate and, only if every check passes, deploys the next version
 * and keeps the old one. The result is always recorded, including rejections and gate failures.
 */
export async function requestChange(
  args: { toolId: string; need: string },
  identity: Identity,
  opts: RequestChangeOptions = {},
): Promise<ChangeRecord | Failure> {
  const need = args.need?.trim() ?? "";
  if (need.length < 10 || need.length > 2000) return fail("invalid_request", "need must be 10 to 2000 characters: describe the field or change you want.");
  const tool = getTool(args.toolId);
  if (!tool) return fail("not_found", `No tool with id "${args.toolId}".`);
  return withToolLock(tool.id, async () => {
    const current = getTool(tool.id)!;
    const prev = getVersion(current.id, current.latestVersion)!;
    const id = `chg_${randomUUID().slice(0, 8)}`;
    const ts = now();
    getDb()
      .prepare("INSERT INTO changes (id, tool_id, requester_user, requester_agent, need, status, from_version, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(id, current.id, identity.user, identity.agent, need, "reviewing", current.latestVersion, ts, ts);

    let result: CreatorResult;
    try {
      result = await (opts.creator ?? reviewWithCreator)(
        {
          toolId: current.id,
          toolName: current.name,
          toolDescription: current.description,
          currentSource: prev.source,
          currentSchema: prev.schema,
          need,
        },
        { timeoutMs: opts.timeoutMs },
      );
    } catch (e) {
      update(id, { status: "error", reason: (e as Error).message });
      return getChange(id)!;
    }
    const base = { backend: result.backend, cached: result.cached ? 1 : 0, decision: result.decision.decision, reason: result.decision.reason };
    const extra = (gate: GateResult | null) => JSON.stringify({ gate, notes: result.notes });
    if (result.decision.decision === "reject") {
      update(id, { ...base, status: "rejected", gate_json: extra(null) });
      return getChange(id)!;
    }
    const newSource = result.decision.newSource;
    if (!newSource?.trim()) {
      update(id, { ...base, status: "error", reason: "The creator agent accepted but returned no source.", gate_json: extra(null) });
      return getChange(id)!;
    }
    const diff = createTwoFilesPatch(`v${current.latestVersion}.py`, `v${current.latestVersion + 1}.py`, prev.source, newSource, "", "", { context: 3 });
    const gate = await runDeployGate({
      toolId: current.id,
      prevVersion: current.latestVersion,
      prevSource: prev.source,
      prevSchema: prev.schema,
      nextSource: newSource,
      checks: current.checks,
    });
    if (!gate.pass) {
      update(id, { ...base, status: "gate_failed", diff, new_source: newSource, gate_json: extra(gate) });
      return getChange(id)!;
    }
    const toVersion = current.latestVersion + 1;
    const file = materialize(current.id, toVersion, newSource);
    const schemaRes = await readSchema(file);
    if (!schemaRes.ok) {
      update(id, { ...base, status: "gate_failed", diff, new_source: newSource, gate_json: extra({ pass: false, checks: [...gate.checks, { name: "Deploy", pass: false, detail: schemaRes.error }] }) });
      return getChange(id)!;
    }
    const db = getDb();
    db.exec("BEGIN");
    try {
      db.prepare("INSERT INTO versions (tool_id, version, source, schema_json, created_at) VALUES (?,?,?,?,?)").run(current.id, toVersion, newSource, JSON.stringify(schemaRes.schema), now());
      db.prepare("UPDATE tools SET latest_version = ? WHERE id = ?").run(toVersion, current.id);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      update(id, { ...base, status: "error", reason: `deploy failed: ${(e as Error).message}`, gate_json: extra(gate) });
      return getChange(id)!;
    }
    update(id, { ...base, status: "deployed", to_version: toVersion, diff, new_source: newSource, gate_json: extra(gate) });
    return getChange(id)!;
  });
}
