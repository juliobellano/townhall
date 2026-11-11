import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getChange, listChanges, requestChange, type ChangeRecord } from "@/lib/town/changes";
import { cachedBackend, reviewWithCreator, type Backend } from "@/lib/town/creator";
import { getTool, publishTool, runTool } from "@/lib/town/registry";
import { BRANCH_REPORT_CHECKS, expected, maria, readTool, sarah, setupTown } from "./helpers";

let cleanup: () => void;
beforeAll(() => {
  cleanup = setupTown().cleanup;
});
afterAll(() => cleanup());

const v1 = readTool("v1.py");
const v2 = readTool("v2.py");
let n = 0;
async function newTool(source = v1, checks: object = BRANCH_REPORT_CHECKS) {
  const name = `Report ${++n}`;
  const res = await publishTool({ name, description: "Monthly totals per branch (test tool).", source, checks }, sarah);
  if (!res.ok) throw new Error(res.error);
  return res.tool.id;
}
type Req = Parameters<typeof reviewWithCreator>[0];
type Opts = Parameters<typeof reviewWithCreator>[1];
const stub = (fn: Backend) => (req: Req, o?: Opts) => reviewWithCreator(req, { ...o, backends: { stub: fn }, order: ["stub"] });
const asChange = (r: ChangeRecord | { ok: false }): ChangeRecord => {
  if ("ok" in r) throw new Error(JSON.stringify(r));
  return r;
};
const NEED = "I need a timezone input so the month cutoff matches my branch's local midnight.";

describe("requestChange: accept path", () => {
  it("deploys v2, keeps v1, records the diff and gate, and the new input works", async () => {
    const id = await newTool();
    const c = asChange(await requestChange({ toolId: id, need: NEED }, maria, { creator: stub(async () => ({ decision: "accept", reason: "Optional field, default UTC.", newSource: v2 })) }));
    expect(c).toMatchObject({ status: "deployed", decision: "accept", fromVersion: 1, toVersion: 2, backend: "stub", cached: false });
    expect(c.requester).toEqual(maria);
    expect(c.gate?.pass).toBe(true);
    expect(c.diff).toMatch(/^\+.*timezone/m);
    expect(getTool(id)!.latestVersion).toBe(2);
    expect(Object.keys((getTool(id)!.inputSchema as { properties: object }).properties)).toContain("timezone");

    const jakarta = await runTool({ id, inputs: { month: "2026-10", timezone: "Asia/Jakarta" } }, maria);
    expect(jakarta.ok && (jakarta.output as { grand_total: number }).grand_total).toBe(expected["Asia/Jakarta"].grand_total);
    // v1 stays available and is unchanged for existing agents
    const old = await runTool({ id, version: 1, inputs: { month: "2026-10" } }, maria);
    expect(old.ok && (old.output as { grand_total: number }).grand_total).toBe(expected.UTC.grand_total);
    // a v1-pinned call that passes timezone errors loudly instead of silently giving a wrong total
    expect(await runTool({ id, version: 1, inputs: { month: "2026-10", timezone: "Asia/Jakarta" } }, maria)).toMatchObject({ ok: false, code: "invalid_inputs" });
    expect(getChange(c.id)?.status).toBe("deployed");
  });
});

describe("requestChange: other outcomes are recorded and v1 stays live", () => {
  it("records a rejection and deploys nothing", async () => {
    const id = await newTool();
    const c = asChange(await requestChange({ toolId: id, need: "Please add a way to read the raw customer table." }, maria, { creator: stub(async () => ({ decision: "reject", reason: "Needs new data access." })) }));
    expect(c).toMatchObject({ status: "rejected", decision: "reject", toVersion: null });
    expect(getTool(id)!.latestVersion).toBe(1);
  });
  it("blocks a change that fails the gate and shows why", async () => {
    const id = await newTool();
    const bad = v2.replace("import sys\n", "import sys\nimport socket\n");
    const c = asChange(await requestChange({ toolId: id, need: NEED }, maria, { creator: stub(async () => ({ decision: "accept", reason: "ok", newSource: bad })) }));
    expect(c.status).toBe("gate_failed");
    expect(c.gate?.checks.find((x) => !x.pass)?.name).toBe("Source scan (lint)");
    expect(c.diff).toBeTruthy();
    expect(getTool(id)!.latestVersion).toBe(1);
  });
  it("blocks an auto-deploy for a tool published without fixtures", async () => {
    const id = await newTool(v1, {});
    const c = asChange(await requestChange({ toolId: id, need: NEED }, maria, { creator: stub(async () => ({ decision: "accept", reason: "ok", newSource: v2 })) }));
    expect(c.status).toBe("gate_failed");
    expect(c.gate?.checks.find((x) => !x.pass)?.detail).toMatch(/no fixtures recorded/);
    expect(getTool(id)!.latestVersion).toBe(1);
  });
  it("treats an accept with no source as an error", async () => {
    const id = await newTool();
    const c = asChange(await requestChange({ toolId: id, need: NEED }, maria, { creator: stub(async () => ({ decision: "accept", reason: "ok" })) }));
    expect(c.status).toBe("error");
    expect(getTool(id)!.latestVersion).toBe(1);
  });
  it("records an error when no creator agent is available at all", async () => {
    const id = await newTool("import sys, json\nif '--schema' in sys.argv:\n    print(json.dumps({'type':'object','properties':{}}))\nelse:\n    print(json.dumps({'ok': True}))\n", {});
    const c = asChange(
      await requestChange({ toolId: id, need: NEED }, maria, {
        creator: (req, o) => reviewWithCreator(req, { ...o, backends: { stub: async () => { throw new Error("down"); } }, order: ["stub", "cached"] }),
      }),
    );
    expect(c.status).toBe("error");
    expect(c.reason).toMatch(/No creator agent available/);
    expect(c.reason).toMatch(/stub: down/);
    expect(getTool(id)!.latestVersion).toBe(1);
  });
});

describe("requestChange: cached fallback is labeled", () => {
  // the live backend is a stub; the cached backend is the real one
  const withFallback = (live: Backend) => (req: Req, o?: Opts) =>
    reviewWithCreator(req, { ...o, backends: { stub: live, cached: cachedBackend }, order: ["stub", "cached"] });

  it("falls back to the cached decision when the live backend fails, and says so", async () => {
    const id = await newTool();
    const c = asChange(await requestChange({ toolId: id, need: NEED }, maria, { creator: withFallback(async () => { throw new Error("rate limited"); }) }));
    expect(c).toMatchObject({ status: "deployed", backend: "cached", cached: true });
    expect(c.notes.join(" ")).toMatch(/stub: rate limited/);
  });
  it("falls back when the live backend times out", async () => {
    const id = await newTool();
    const c = asChange(await requestChange({ toolId: id, need: NEED }, maria, { timeoutMs: 300, creator: withFallback(() => new Promise(() => {})) }));
    expect(c).toMatchObject({ status: "deployed", backend: "cached", cached: true });
    expect(c.notes.join(" ")).toMatch(/timed out/);
  });
});

describe("requestChange: validation and concurrency", () => {
  it("rejects a too-short need and an unknown tool", async () => {
    const id = await newTool();
    expect(await requestChange({ toolId: id, need: "tz" }, maria)).toMatchObject({ ok: false, code: "invalid_request" });
    expect(await requestChange({ toolId: "nope", need: NEED }, maria)).toMatchObject({ ok: false, code: "not_found" });
  });
  it("serializes simultaneous requests on one tool so versions are sequential", async () => {
    const id = await newTool();
    const creator = stub(async () => ({ decision: "accept", reason: "ok", newSource: v2 }));
    const [a, b] = await Promise.all([requestChange({ toolId: id, need: NEED }, maria, { creator }), requestChange({ toolId: id, need: NEED + " Please." }, maria, { creator })]);
    const versions = [asChange(a).toVersion, asChange(b).toVersion].sort();
    expect(versions).toEqual([2, 3]);
    expect(getTool(id)!.latestVersion).toBe(3);
    expect(listChanges(50, id)).toHaveLength(2);
  });
});
