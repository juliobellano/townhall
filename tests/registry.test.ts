import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTool, listRuns, publishTool, runTool, searchTools } from "@/lib/town/registry";
import { BRANCH_REPORT_CHECKS, expected, maria, readTool, sarah, setupTown } from "./helpers";

let cleanup: () => void;
beforeAll(() => {
  cleanup = setupTown().cleanup;
});
afterAll(() => cleanup());

const publishArgs = {
  name: "Tax filing report",
  description: "Monthly totals per branch from the company branch databases.",
  touches: ["branch databases (read only)"],
  source: readTool("v1.py"),
  checks: BRANCH_REPORT_CHECKS,
};

describe("publishTool", () => {
  it("publishes v1, reading the schema from the code", async () => {
    const res = await publishTool(publishArgs, sarah);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.tool.id).toBe("tax-filing-report");
      expect(res.tool.owner).toBe("sarah");
      expect(res.tool.latestVersion).toBe(1);
      expect(res.tool.inputSchema).toMatchObject({ required: ["month"] });
      expect(Object.keys((res.tool.inputSchema as { properties: object }).properties)).toEqual(["branches", "month"]);
    }
  });
  it("rejects a duplicate name and points to request_change", async () => {
    const res = await publishTool(publishArgs, sarah);
    expect(res).toMatchObject({ ok: false, code: "conflict" });
    if (!res.ok) expect(res.error).toMatch(/request_change/);
  });
  it("rejects a script that breaks the tool contract, with fix instructions", async () => {
    const res = await publishTool({ ...publishArgs, name: "No schema", source: "import json\nprint(json.dumps({'x': 1}))\n" }, sarah);
    expect(res).toMatchObject({ ok: false, code: "contract_violation" });
    if (!res.ok) expect(res.error).toMatch(/--schema/);
    expect(getTool("no-schema")).toBeNull();
  });
  it("rejects missing fields and invalid fixtures", async () => {
    expect(await publishTool({ ...publishArgs, name: "  " }, sarah)).toMatchObject({ ok: false, code: "invalid_request" });
    expect(await publishTool({ ...publishArgs, name: "Short", description: "short" }, sarah)).toMatchObject({ ok: false, code: "invalid_request" });
    const bad = await publishTool({ ...publishArgs, name: "Bad fixtures", checks: { fixtures: [{ inputs: { month: "nope" } }] } }, sarah);
    expect(bad).toMatchObject({ ok: false, code: "invalid_request" });
    expect(getTool("bad-fixtures")).toBeNull();
  });
});

describe("searchTools", () => {
  it("lists all with an empty query and matches words in name or description", () => {
    expect(searchTools().map((t) => t.id)).toEqual(["tax-filing-report"]);
    expect(searchTools("tax").length).toBe(1);
    expect(searchTools("monthly branch").length).toBe(1);
    expect(searchTools("zzz-nothing")).toEqual([]);
  });
});

describe("runTool", () => {
  it("runs v1 and returns the expected October totals", async () => {
    const res = await runTool({ id: "tax-filing-report", inputs: { month: "2026-10" } }, maria);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect((res.output as { grand_total: number }).grand_total).toBe(expected.UTC.grand_total);
      expect(res.version).toBe(1);
    }
  });
  it("rejects an undeclared input key against v1 instead of silently ignoring it", async () => {
    const res = await runTool({ id: "tax-filing-report", version: 1, inputs: { month: "2026-10", timezone: "Asia/Jakarta" } }, maria);
    expect(res).toMatchObject({ ok: false, code: "invalid_inputs" });
    if (!res.ok) expect(res.error).toMatch(/Unknown input: timezone/);
  });
  it("returns a structured error for invalid inputs, an unknown tool, and an unknown version", async () => {
    expect(await runTool({ id: "tax-filing-report", inputs: {} }, maria)).toMatchObject({ ok: false, code: "invalid_inputs" });
    expect(await runTool({ id: "nope", inputs: {} }, maria)).toMatchObject({ ok: false, code: "not_found" });
    expect(await runTool({ id: "tax-filing-report", version: 9, inputs: { month: "2026-10" } }, maria)).toMatchObject({ ok: false, code: "not_found" });
  });
  it("turns a tool failure into a structured error", async () => {
    const res = await runTool({ id: "tax-filing-report", inputs: { month: "2026-10", branches: ["paris"] } }, maria);
    expect(res).toMatchObject({ ok: false, code: "tool_failed" });
    if (!res.ok) expect(res.error).toMatch(/unknown branch/);
  });
  it("writes an audit row with person and agent for every run, including failures", async () => {
    const runs = listRuns(50, "tax-filing-report");
    expect(runs.length).toBeGreaterThanOrEqual(4);
    const ok = runs.find((r) => r.ok);
    expect(ok).toMatchObject({ person: "maria", agent: "claude-desktop", version: 1 });
    expect(runs.some((r) => !r.ok && r.error?.includes("Unknown input"))).toBe(true);
  });
});
