import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runDeployGate } from "@/lib/town/gate";
import { getTool, getVersion, publishTool } from "@/lib/town/registry";
import { BRANCH_REPORT_CHECKS, readTool, sarah, setupTown } from "./helpers";

let cleanup: () => void;
beforeAll(async () => {
  cleanup = setupTown().cleanup;
  const res = await publishTool(
    { name: "Branch report", description: "Monthly totals per branch from the company databases.", source: readTool("v1.py"), checks: BRANCH_REPORT_CHECKS },
    sarah,
  );
  if (!res.ok) throw new Error(res.error);
});
afterAll(() => cleanup());

async function gate(nextSource: string) {
  const tool = getTool("branch-report")!;
  const prev = getVersion("branch-report", 1)!;
  return runDeployGate({ toolId: tool.id, prevVersion: 1, prevSource: prev.source, prevSchema: prev.schema, nextSource, checks: tool.checks });
}
const failing = (r: Awaited<ReturnType<typeof gate>>) => r.checks.filter((c) => !c.pass).map((c) => c.name);
const v2 = readTool("v2.py");

describe("deploy gate", () => {
  it("passes the hand-made v2 on every check, including the recorded Jakarta total", async () => {
    const r = await gate(v2);
    expect(failing(r)).toEqual([]);
    expect(r.pass).toBe(true);
    expect(r.checks.map((c) => c.name)).toEqual(["Tool contract", "Schema diff", "Source scan (lint)", "Fixture runs (compatibility)", "Recorded totals (expectations)"]);
    expect(r.checks[1].detail).toMatch(/adds optional input with defaults: timezone/);
    expect(r.checks[4].detail).toMatch(/1 recorded expectation/);
  });

  it("rejects a change that makes the new input required", async () => {
    const r = await gate(v2.replace('"required": ["month"]', '"required": ["month", "timezone"]'));
    expect(failing(r)).toContain("Schema diff");
    expect(r.pass).toBe(false);
  });

  it("rejects a change that removes an input", async () => {
    const r = await gate(v2.replace(/        "branches": \{[\s\S]*?\n        \},\n/, ""));
    expect(failing(r)).toContain("Schema diff");
    expect(r.checks.find((c) => c.name === "Schema diff")!.detail).toMatch(/removed input "branches"/);
  });

  it("rejects a new import outside the allowlist", async () => {
    const r = await gate(v2.replace("import sys\n", "import sys\nimport socket\n"));
    expect(failing(r)).toContain("Source scan (lint)");
    expect(r.checks.find((c) => c.name === "Source scan (lint)")!.detail).toMatch(/socket/);
  });

  it("rejects a denied call in an added line", async () => {
    const anchor = "    pdf = tax_filing_pdf(report)\n";
    expect(v2).toContain(anchor);
    const r = await gate(v2.replace(anchor, '    leak = open("/etc/hosts").read()\n' + anchor));
    expect(failing(r)).toContain("Source scan (lint)");
  });

  it("rejects a change that ignores the new input (wrong recorded total)", async () => {
    const r = await gate(v2.replace("when.astimezone(tz).strftime", "when.strftime"));
    expect(failing(r)).toEqual(["Recorded totals (expectations)"]);
  });

  it("rejects a change that alters output at defaults (compatibility)", async () => {
    const r = await gate(v2.replace('"total": total}', '"total": total + 1}'));
    expect(failing(r)).toContain("Fixture runs (compatibility)");
  });

  it("fails the compatibility check when the tool has no fixtures, instead of passing vacuously", async () => {
    const pub = await publishTool({ name: "Unchecked report", description: "A tool published with no example inputs.", source: readTool("v1.py") }, sarah);
    expect(pub.ok).toBe(true);
    const prev = getVersion("unchecked-report", 1)!;
    const r = await runDeployGate({ toolId: "unchecked-report", prevVersion: 1, prevSource: prev.source, prevSchema: prev.schema, nextSource: v2, checks: {} });
    expect(failing(r)).toEqual(["Fixture runs (compatibility)"]);
    expect(r.checks.find((c) => !c.pass)!.detail).toMatch(/no fixtures recorded/);
  });

  it("rejects a script that breaks the tool contract", async () => {
    const r = await gate("import json\nprint(json.dumps({'x': 1}))\n");
    expect(failing(r)).toEqual(["Tool contract"]);
    expect(r.checks).toHaveLength(1);
  });

  it("reports a crash in the new version as a failed fixture run, not a thrown error", async () => {
    const r = await gate(v2.replace("tz = ZoneInfo(tz_name)", "tz = ZoneInfo(tz_name)\n        raise RuntimeError('boom')"));
    expect(failing(r)).toContain("Fixture runs (compatibility)");
  });
});
