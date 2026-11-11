import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createTownMcpServer } from "@/lib/mcp/server";
import { runDeployGate } from "@/lib/town/gate";
import { extractFiles, getRunFile, getTool, getVersion, listRuns, publishTool, runTool } from "@/lib/town/registry";
import { BRANCH_REPORT_CHECKS, maria, readTool, sarah, setupTown } from "./helpers";

let cleanup: () => void;
beforeAll(async () => {
  cleanup = setupTown().cleanup;
  const res = await publishTool(
    { name: "Tax filing report", description: "Monthly totals per branch, with a PDF.", source: readTool("v1.py"), checks: BRANCH_REPORT_CHECKS },
    sarah,
  );
  if (!res.ok) throw new Error(res.error);
});
afterAll(() => cleanup());

const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("extractFiles", () => {
  it("lifts _files out of the output and leaves other outputs alone", () => {
    const r = extractFiles({ total: 1, _files: [{ name: "a.pdf", mime_type: "application/pdf", base64: b64("%PDF") }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).toEqual({ total: 1 });
    expect(r.files.map((f) => [f.name, f.mimeType, f.data.toString()])).toEqual([["a.pdf", "application/pdf", "%PDF"]]);
    expect(extractFiles({ total: 1 })).toEqual({ ok: true, output: { total: 1 }, files: [] });
    expect(extractFiles([1, 2])).toEqual({ ok: true, output: [1, 2], files: [] });
  });

  it("rejects unsafe names, duplicates and malformed entries", () => {
    for (const name of ["../etc/passwd", "a/b.pdf", ".hidden", "", "x".repeat(101)]) {
      expect(extractFiles({ _files: [{ name, base64: b64("x") }] }).ok).toBe(false);
    }
    expect(extractFiles({ _files: [{ name: "a.pdf", base64: "" }, { name: "a.pdf", base64: "" }] }).ok).toBe(false);
    expect(extractFiles({ _files: "nope" }).ok).toBe(false);
    expect(extractFiles({ _files: [{ name: "a.pdf" }] }).ok).toBe(false);
  });

  it("falls back to a generic type for an odd mime type", () => {
    const r = extractFiles({ _files: [{ name: "a.bin", mime_type: "not a type", base64: "" }] });
    expect(r.ok && r.files[0].mimeType).toBe("application/octet-stream");
  });
});

describe("the tax filing report returns tax-filing.pdf", () => {
  it("stores the PDF and keeps the bytes out of the result and the audit log", async () => {
    const res = await runTool({ id: "tax-filing-report", inputs: { month: "2026-10" } }, maria);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.files).toEqual([{ name: "tax-filing.pdf", mimeType: "application/pdf", bytes: expect.any(Number), url: `/api/files/${res.runId}/tax-filing.pdf` }]);
    expect(res.output).not.toHaveProperty("_files");
    expect(res.output).toMatchObject({ grand_total: 1620060 });
    const run = listRuns(1, "tax-filing-report")[0];
    expect(run.id).toBe(res.runId);
    expect(JSON.stringify(run.output)).not.toContain("_files");
    expect(run.files.map((f) => f.name)).toEqual(["tax-filing.pdf"]);
    const stored = getRunFile(res.runId, "tax-filing.pdf")!;
    expect(stored.toolId).toBe("tax-filing-report");
    const pdf = fs.readFileSync(stored.path);
    expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(pdf.toString("latin1")).toContain("(Tax filing report)");
    expect(pdf.toString("latin1")).toContain("1,620,060");
    expect(getRunFile(res.runId, "other.pdf")).toBeNull();
  });

  it("returns a download link and a save command over MCP", async () => {
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createTownMcpServer(maria, { origin: "http://townhall.test" }).connect(b);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(a);
    const res = (await client.callTool({ name: "run_tool", arguments: { id: "tax-filing-report", inputs: { month: "2026-10" } } })) as {
      content: { type: string; text?: string; uri?: string; name?: string }[];
    };
    const body = JSON.parse(res.content[0].text!);
    expect(res.content[0].text).not.toContain("base64");
    expect(body.files[0]).toMatchObject({ name: "tax-filing.pdf", mime_type: "application/pdf", download_url: `http://townhall.test/api/files/${body.runId}/tax-filing.pdf` });
    expect(body.files[0].save_with).toContain("X-Townhall-User: maria");
    expect(res.content[1]).toMatchObject({ type: "resource_link", uri: body.files[0].download_url, name: "tax-filing.pdf" });
  });

  it("the deploy gate compares the PDF too: a v2 that changes it is blocked", async () => {
    const prev = getVersion("tax-filing-report", 1)!;
    const tool = getTool("tax-filing-report")!;
    const changed = readTool("v2.py").replace('"Source: branch databases (read only)"', '"Source: somewhere else"');
    expect(changed).not.toBe(readTool("v2.py"));
    const gate = await runDeployGate({ toolId: tool.id, prevVersion: 1, prevSource: prev.source, prevSchema: prev.schema, nextSource: changed, checks: tool.checks });
    expect(gate.checks.find((c) => c.name === "Fixture runs (compatibility)")?.pass).toBe(false);
    const ok = await runDeployGate({ toolId: tool.id, prevVersion: 1, prevSource: prev.source, prevSchema: prev.schema, nextSource: readTool("v2.py"), checks: tool.checks });
    expect(ok.pass).toBe(true);
  });

  it("a malformed _files is a contract violation, audited as a failed run", async () => {
    const src = `import json, sys
if "--schema" in sys.argv:
    print(json.dumps({"type": "object", "properties": {}}))
else:
    print(json.dumps({"ok": True, "_files": [{"name": "../x.pdf", "base64": ""}]}))
`;
    const pub = await publishTool({ name: "Bad files", description: "Returns a file with an unsafe name.", source: src }, sarah);
    expect(pub.ok).toBe(true);
    const res = await runTool({ id: "bad-files", inputs: {} }, sarah);
    expect(res).toMatchObject({ ok: false, code: "contract_violation" });
    expect(listRuns(1, "bad-files")[0]).toMatchObject({ ok: false, files: [] });
  });
});
