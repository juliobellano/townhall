export type Identity = { user: string; agent: string };

export type Check = {
  /** Inputs both versions are run with; their outputs must match (compatibility). */
  fixtures?: { inputs: Record<string, unknown> }[];
  /** Inputs a new version must satisfy once it declares every key. `expect` is a partial match on the output. */
  expectations?: { inputs: Record<string, unknown>; expect: Record<string, unknown> }[];
};

export type ToolSummary = {
  id: string;
  name: string;
  description: string;
  owner: string;
  touches: string[];
  /** Departments allowed to use the tool. Empty means everyone. The owner can always use it. */
  access: string[];
  latestVersion: number;
  createdAt: string;
};

export type ToolDetail = ToolSummary & {
  inputSchema: Record<string, unknown>;
  versions: { version: number; createdAt: string }[];
  checks: Check;
};

/** A file a tool returned, stored by Town Hall. `url` is site-relative: /api/files/<runId>/<name>. */
export type RunFile = { name: string; mimeType: string; bytes: number; url: string };

export type RunRecord = {
  id: number;
  toolId: string;
  version: number;
  person: string;
  agent: string;
  inputs: unknown;
  ok: boolean;
  /** The run was refused by access control (still audited). */
  denied: boolean;
  output: unknown;
  files: RunFile[];
  error: string | null;
  durationMs: number;
  createdAt: string;
};

export type ErrorCode = "not_found" | "invalid_inputs" | "tool_failed" | "contract_violation" | "invalid_request" | "conflict" | "forbidden";

export type Failure = { ok: false; code: ErrorCode; error: string };
export type Success<T> = { ok: true } & T;
