import { spawn } from "node:child_process";
import path from "node:path";
import { dataDir, pythonBin } from "./paths";
import { isInputSchema, type JsonSchema } from "./schema";

export type RunResult =
  | { ok: true; output: unknown; durationMs: number }
  | { ok: false; error: string; durationMs: number; timedOut: boolean };

const MAX_OUTPUT_BYTES = 1_000_000;

/**
 * Runs a tool script as a subprocess with a stripped environment: only PATH and
 * the company data directory. This is a stripped-env process, NOT a sandbox.
 * Contract: JSON inputs on stdin, JSON result on stdout, failures exit non-zero
 * and may print {"error": "..."} on stdout.
 */
export function runScript(
  file: string,
  inputs: unknown,
  opts: { timeoutMs?: number; args?: string[]; dataDir?: string } = {},
): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(pythonBin(), [file, ...(opts.args ?? [])], {
      cwd: path.dirname(file),
      env: {
        PATH: process.env.PATH ?? "",
        TOWNHALL_DATA_DIR: opts.dataDir ?? dataDir(),
        PYTHONDONTWRITEBYTECODE: "1",
      } as unknown as NodeJS.ProcessEnv, // Next's typings require NODE_ENV; the child must not get more than this
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const finish = (r: RunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += d.toString();
    });
    child.on("error", (e) =>
      finish({ ok: false, error: `Could not start the tool: ${e.message}`, durationMs: Date.now() - started, timedOut: false }),
    );
    child.on("close", (code) => {
      const durationMs = Date.now() - started;
      if (timedOut) {
        return finish({ ok: false, error: `Tool timed out after ${Math.round(timeoutMs / 1000)}s`, durationMs, timedOut: true });
      }
      let parsed: unknown;
      let parseOk = true;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        parseOk = false;
      }
      if (code !== 0) {
        const fromTool =
          parseOk && parsed && typeof parsed === "object" && "error" in parsed ? String((parsed as { error: unknown }).error) : null;
        const detail = fromTool ?? (stderr.trim().split("\n").slice(-3).join(" ") || `exited with code ${code}`);
        return finish({ ok: false, error: detail, durationMs, timedOut: false });
      }
      if (!parseOk) {
        return finish({ ok: false, error: "Tool did not print valid JSON on stdout", durationMs, timedOut: false });
      }
      finish({ ok: true, output: parsed, durationMs });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(inputs === undefined ? "" : JSON.stringify(inputs));
  });
}

/** Reads a script's own input schema (`--schema`). The schema comes from the code, so it cannot drift from it. */
export async function readSchema(file: string): Promise<{ ok: true; schema: JsonSchema } | { ok: false; error: string }> {
  const res = await runScript(file, undefined, { args: ["--schema"], timeoutMs: 10_000 });
  if (!res.ok) {
    return { ok: false, error: `Tool contract violation: running the script with --schema failed (${res.error}).` };
  }
  if (!isInputSchema(res.output)) {
    return {
      ok: false,
      error:
        'Tool contract violation: --schema must print a JSON Schema object with type "object" and a "properties" object.',
    };
  }
  return { ok: true, schema: res.output };
}
