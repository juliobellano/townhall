import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestChange } from "@/lib/town/changes";
import { cachedBackend, reviewWithCreator } from "@/lib/town/creator";
import { getRunFile, publishTool, runTool } from "@/lib/town/registry";
import { BRANCH_REPORT_CHECKS, maria, readTool, sarah, setupTown } from "./helpers";

let cleanup: () => void;
beforeAll(async () => {
  cleanup = setupTown().cleanup;
  const res = await publishTool({ name: "Tax filing report", description: "Monthly totals per branch, with a PDF.", source: readTool("v1.py"), checks: BRANCH_REPORT_CHECKS }, sarah);
  if (!res.ok) throw new Error(res.error);
});
afterAll(() => cleanup());

const pdfText = (runId: number) => fs.readFileSync(getRunFile(runId, "tax-filing.pdf")!.path).toString("latin1");

describe("demo: the filing threshold fix", () => {
  it("v1 prints a 50,000 USD threshold; the threshold request deploys v2 and the rerun prints 100,000 USD", async () => {
    const v1 = await runTool({ id: "tax-filing-report", inputs: { month: "2026-10" } }, maria);
    expect(v1.ok && v1.output).toMatchObject({ filing_threshold_usd: 50000 });
    if (v1.ok) expect(pdfText(v1.runId)).toContain("Filing threshold: 50,000 USD");

    const need = "The filing portal rejected the PDF: please update your threshold format to 100.000 USD.";
    const chg = await requestChange({ toolId: "tax-filing-report", need }, maria, {
      creator: (req, o) => reviewWithCreator(req, { ...o, order: ["cached"], backends: { cached: cachedBackend } }),
    });
    expect(chg).toMatchObject({ status: "deployed", toVersion: 2 });
    if (!("gate" in chg)) return;
    expect(chg.gate?.pass).toBe(true);

    const v2 = await runTool({ id: "tax-filing-report", inputs: { month: "2026-10", threshold_usd: 100000 } }, maria);
    expect(v2.ok && v2.output).toMatchObject({ filing_threshold_usd: 100000, grand_total: 1620060 });
    if (v2.ok) expect(pdfText(v2.runId)).toContain("Filing threshold: 100,000 USD");
  });
});
