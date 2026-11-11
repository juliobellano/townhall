import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readSchema, runScript } from "@/lib/town/runner";
import { writeScript } from "./helpers";

let dir: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "townhall-runner-"));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("runScript", () => {
  it("passes JSON on stdin and parses JSON from stdout", async () => {
    const f = writeScript(dir, "echo.py", "import sys, json\nprint(json.dumps({'got': json.load(sys.stdin)}))\n");
    const res = await runScript(f, { a: 1 });
    expect(res).toMatchObject({ ok: true, output: { got: { a: 1 } } });
  });
  it("turns a non-zero exit into a structured error using the tool's own message", async () => {
    const f = writeScript(dir, "fail.py", "import json, sys\nprint(json.dumps({'error': 'bad input'}))\nsys.exit(2)\n");
    const res = await runScript(f, {});
    expect(res).toMatchObject({ ok: false, error: "bad input" });
  });
  it("falls back to stderr when the tool prints no JSON error", async () => {
    const f = writeScript(dir, "crash.py", "raise RuntimeError('boom')\n");
    const res = await runScript(f, {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/boom/);
  });
  it("kills a tool that exceeds the timeout", async () => {
    const f = writeScript(dir, "hang.py", "import time\ntime.sleep(30)\n");
    const res = await runScript(f, {}, { timeoutMs: 400 });
    expect(res).toMatchObject({ ok: false, timedOut: true });
  });
  it("errors when stdout is not JSON", async () => {
    const f = writeScript(dir, "text.py", "print('hello')\n");
    const res = await runScript(f, {});
    expect(res).toMatchObject({ ok: false, error: "Tool did not print valid JSON on stdout" });
  });
  it("runs with a stripped environment", async () => {
    process.env.TOWNHALL_SECRET_FOR_TEST = "do-not-leak";
    const f = writeScript(dir, "env.py", "import os, json\nprint(json.dumps(sorted(os.environ.keys())))\n");
    const res = await runScript(f, {});
    delete process.env.TOWNHALL_SECRET_FOR_TEST;
    expect(res.ok).toBe(true);
    if (res.ok) {
      const keys = res.output as string[];
      expect(keys).not.toContain("TOWNHALL_SECRET_FOR_TEST");
      expect(keys).not.toContain("HOME");
      expect(keys).toContain("TOWNHALL_DATA_DIR");
    }
  });
});

describe("readSchema", () => {
  it("reads the schema the script prints with --schema", async () => {
    const f = writeScript(dir, "ok.py", "import sys, json\nif '--schema' in sys.argv:\n    print(json.dumps({'type':'object','properties':{'x':{'type':'string'}}}))\n");
    const res = await readSchema(f);
    expect(res).toMatchObject({ ok: true, schema: { type: "object" } });
  });
  it("rejects a script that does not support --schema", async () => {
    const f = writeScript(dir, "noschema.py", "import json\nprint(json.dumps({'hello': 1}))\n");
    const res = await readSchema(f);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Tool contract violation/);
  });
  it("rejects a schema that is not an object schema", async () => {
    const f = writeScript(dir, "badschema.py", "import json\nprint(json.dumps({'type': 'string'}))\n");
    const res = await readSchema(f);
    expect(res.ok).toBe(false);
  });
});
