import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createTownMcpServer, identityFromHeaders, type Identity } from "@/lib/mcp/server";
import { listRuns } from "@/lib/town/registry";
import { expected, maria, readTool, sarah, setupTown } from "./helpers";

let cleanup: () => void;
beforeAll(() => {
  cleanup = setupTown().cleanup;
  process.env.TOWNHALL_CREATOR = "cached"; // no live creator in tests
});
afterAll(() => {
  delete process.env.TOWNHALL_CREATOR;
  cleanup();
});

async function connect(identity: Identity) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createTownMcpServer(identity).connect(b);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(a);
  return client;
}
type Call = { isError?: boolean; content: { type: string; text: string }[] };
const call = async (c: Client, name: string, args: Record<string, unknown>) => {
  const res = (await c.callTool({ name, arguments: args })) as Call;
  return { isError: !!res.isError, body: JSON.parse(res.content[0].text) as Record<string, any> };
};

describe("identityFromHeaders", () => {
  it("requires both headers", () => {
    expect(identityFromHeaders(new Headers({ "x-townhall-user": "a", "x-townhall-agent": "b" }))).toEqual({ user: "a", agent: "b" });
    expect(identityFromHeaders(new Headers({ "x-townhall-user": "a" }))).toBeNull();
    expect(identityFromHeaders(new Headers())).toBeNull();
  });
});

describe("Town Hall MCP tools, end to end through an MCP client", () => {
  it("exposes the generic tool set", async () => {
    const c = await connect(sarah);
    const names = (await c.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_tool", "publish_tool", "request_change", "run_tool", "search_tools"]);
  });

  it("beat 1: an agent publishes a tool; a contract violation comes back with fix instructions", async () => {
    const c = await connect(sarah);
    const bad = await call(c, "publish_tool", { name: "Broken", description: "A script that does not follow the contract.", source: "print('hi')" });
    expect(bad.isError).toBe(true);
    expect(bad.body.code).toBe("contract_violation");
    expect(bad.body.error).toMatch(/--schema/);
    const ok = await call(c, "publish_tool", {
      name: "Branch finance report",
      description: "Monthly sales totals per branch from the company branch databases.",
      touches: ["branch databases (read only)"],
      source: readTool("v1.py"),
    });
    expect(ok.isError).toBe(false);
    expect(ok.body.tool).toMatchObject({ id: "branch-finance-report", owner: "sarah", latestVersion: 1 });
  });

  it("beat 2: a colleague's agent searches, reads the schema, and runs the tool", async () => {
    const c = await connect(maria);
    const found = await call(c, "search_tools", { query: "branch finance" });
    expect(found.body.tools.map((t: { id: string }) => t.id)).toEqual(["branch-finance-report"]);
    const got = await call(c, "get_tool", { id: "branch-finance-report" });
    expect(got.body.tool.inputSchema.required).toEqual(["month"]);
    expect(Object.keys(got.body.tool.inputSchema.properties)).not.toContain("timezone");
    const run = await call(c, "run_tool", { id: "branch-finance-report", inputs: { month: "2026-10" } });
    expect(run.isError).toBe(false);
    expect(run.body.output.grand_total).toBe(expected.UTC.grand_total);
    const missing = await call(c, "run_tool", { id: "branch-finance-report", inputs: {} });
    expect(missing).toMatchObject({ isError: true, body: { code: "invalid_inputs" } });
    expect((await call(c, "get_tool", { id: "nope" })).isError).toBe(true);
  });

  it("beat 4: the agent requests a new field, it deploys, and the next call uses it", async () => {
    const c = await connect(maria);
    const before = await call(c, "run_tool", { id: "branch-finance-report", inputs: { month: "2026-10", timezone: "Asia/Jakarta" } });
    expect(before).toMatchObject({ isError: true, body: { code: "invalid_inputs" } });
    const change = await call(c, "request_change", { id: "branch-finance-report", need: "I need a timezone input so the month cutoff matches Asia/Jakarta." });
    expect(change.isError).toBe(false);
    expect(change.body.change).toMatchObject({ status: "deployed", fromVersion: 1, toVersion: 2, cached: true, backend: "cached" });
    expect(change.body.gate.pass).toBe(true);
    expect(change.body.diff).toMatch(/timezone/);
    const got = await call(c, "get_tool", { id: "branch-finance-report" });
    expect(got.body.tool.latestVersion).toBe(2);
    expect(Object.keys(got.body.tool.inputSchema.properties)).toContain("timezone");
    const after = await call(c, "run_tool", { id: "branch-finance-report", inputs: { month: "2026-10", timezone: "Asia/Jakarta" } });
    expect(after.body.output.grand_total).toBe(expected["Asia/Jakarta"].grand_total);
    expect(after.body.version).toBe(2);
    const pinned = await call(c, "run_tool", { id: "branch-finance-report", version: 1, inputs: { month: "2026-10" } });
    expect(pinned.body.output.grand_total).toBe(expected.UTC.grand_total);
  });

  it("audits every call with the caller's user and agent", () => {
    const runs = listRuns(50, "branch-finance-report");
    expect(runs.some((r) => r.person === "maria" && r.agent === "claude-desktop" && r.ok)).toBe(true);
    expect(runs.every((r) => ["maria"].includes(r.person))).toBe(true);
  });
});
