/**
 * End-to-end test over real HTTP against a production build (`npm run e2e`).
 * Starts `next start` on a temp TOWNHALL_HOME, then plays the demo with two MCP clients
 * (Sarah's Claude Code and Maria's Claude Desktop) and checks the pages the UI renders.
 * The creator agent defaults to the labeled cached decision; set TOWNHALL_CREATOR=api|cli
 * to run the live one.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const root = path.resolve(import.meta.dirname, "..");
const port = Number(process.env.E2E_PORT ?? 3199);
const base = `http://localhost:${port}`;
const home = fs.mkdtempSync(path.join(os.tmpdir(), "townhall-e2e-"));
const dataDir = path.join(home, "company");
execFileSync("python3", [path.join(root, "scripts", "seed_data.py"), dataDir], { stdio: "pipe" });

const server = spawn("npx", ["next", "start", "-p", String(port)], {
  cwd: root,
  env: { ...process.env, TOWNHALL_HOME: home, TOWNHALL_DATA_DIR: dataDir, TOWNHALL_CREATOR: process.env.TOWNHALL_CREATOR ?? "cached" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `\n      ${detail}` : ""}`);
};

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base + "/")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not start:\n" + serverLog.slice(-800));
}

async function agent(user: string, agentName: string) {
  const client = new Client({ name: agentName, version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(base + "/api/mcp"), { requestInit: { headers: { "x-townhall-user": user, "x-townhall-agent": agentName } } }));
  return {
    client,
    call: async (name: string, args: Record<string, unknown>) => {
      const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
      return { isError: !!res.isError, body: JSON.parse(res.content[0].text) as Record<string, any> };
    },
  };
}
// Visible text of a page: drop scripts, comments (React puts <!-- --> between adjacent text nodes) and tags.
const html = async (p: string) =>
  (await (await fetch(base + p)).text())
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
const v1 = fs.readFileSync(path.join(root, "tools", "branch-report", "v1.py"), "utf8");
const expected = JSON.parse(fs.readFileSync(path.join(root, "tools", "branch-report", "expected.json"), "utf8"));

try {
  await waitReady();

  const anon = await fetch(base + "/api/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  check("MCP call without identity headers is rejected (401)", anon.status === 401);

  const sarah = await agent("sarah", "claude-code");
  const maria = await agent("maria", "claude-desktop");
  const tools = (await maria.client.listTools()).tools.map((t) => t.name).sort();
  check("MCP lists the five Town Hall tools", tools.join() === "get_tool,publish_tool,request_change,run_tool,search_tools", tools.join());

  // Beat 1: Sarah's agent publishes the tool.
  const pub = await sarah.call("publish_tool", { name: "Branch finance report", description: "Monthly sales totals per branch from the company branch databases.", touches: ["branch databases (read only)"], source: v1, fixtures: [{ month: "2026-10" }], expectations: [{ inputs: { month: "2026-10", timezone: "Asia/Jakarta" }, expect: { grand_total: expected["Asia/Jakarta"].grand_total } }] });
  check("beat 1: Sarah's agent publishes the tool", !pub.isError && pub.body.tool?.id === "branch-finance-report", JSON.stringify(pub.body).slice(0, 200));

  // Beat 2: Maria's agent finds it, reads the schema, runs it.
  const found = await maria.call("search_tools", { query: "branch finance" });
  check("beat 2: Maria's agent finds the tool by search", found.body.tools?.[0]?.id === "branch-finance-report");
  const got = await maria.call("get_tool", { id: "branch-finance-report" });
  check("beat 2: schema is v1 (no timezone yet)", !("timezone" in (got.body.tool?.inputSchema?.properties ?? {})) && got.body.tool?.inputSchema?.required?.[0] === "month");
  const bad = await maria.call("run_tool", { id: "branch-finance-report", inputs: {} });
  check("beat 2: a missing required input is a clear error", bad.isError && bad.body.code === "invalid_inputs");
  const run1 = await maria.call("run_tool", { id: "branch-finance-report", inputs: { month: "2026-10" } });
  check("beat 2: report totals match the recorded UTC total", run1.body.output?.grand_total === expected.UTC.grand_total, String(run1.body.output?.grand_total));

  // Beat 4: Maria's agent needs a timezone, asks the creator agent, then uses it.
  const tz = await maria.call("run_tool", { id: "branch-finance-report", inputs: { month: "2026-10", timezone: "Asia/Jakarta" } });
  check("beat 4: before the change, an undeclared timezone is rejected, not ignored", tz.isError && /Unknown input: timezone/.test(tz.body.error), JSON.stringify(tz.body).slice(0, 200));
  const t0 = Date.now();
  const chg = await maria.call("request_change", { id: "branch-finance-report", need: "I need a timezone input so the month cutoff matches Asia/Jakarta." });
  check("beat 4: the change is deployed as v2", chg.body.change?.status === "deployed" && chg.body.change?.toVersion === 2, JSON.stringify(chg.body).slice(0, 300));
  check("beat 4: the deploy gate passed all checks", chg.body.gate?.pass === true && chg.body.gate.checks.length === 5);
  check(`beat 4: backend is labeled (${chg.body.change?.backend}${chg.body.change?.cached ? ", cached" : ", live"}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`, typeof chg.body.change?.backend === "string");
  const got2 = await maria.call("get_tool", { id: "branch-finance-report" });
  check("beat 4: get_tool now shows timezone and v2", got2.body.tool?.latestVersion === 2 && "timezone" in got2.body.tool.inputSchema.properties);
  const run2 = await maria.call("run_tool", { id: "branch-finance-report", inputs: { month: "2026-10", timezone: "Asia/Jakarta" } });
  check("beat 4: the new field works and moves the total", run2.body.output?.grand_total === expected["Asia/Jakarta"].grand_total, String(run2.body.output?.grand_total));
  const pinned = await maria.call("run_tool", { id: "branch-finance-report", version: 1, inputs: { month: "2026-10" } });
  check("v1 stays available and unchanged", pinned.body.output?.grand_total === expected.UTC.grand_total && pinned.body.version === 1);
  const pinnedTz = await maria.call("run_tool", { id: "branch-finance-report", version: 1, inputs: { month: "2026-10", timezone: "Asia/Jakarta" } });
  check("a v1-pinned call with timezone errors instead of returning a wrong total", pinnedTz.isError && pinnedTz.body.code === "invalid_inputs");

  // The pages a human sees.
  const home_ = await html("/");
  check("UI: catalog lists the tool", home_.includes("Branch finance report"));
  const toolPage = await html("/tools/branch-finance-report");
  check("UI: tool page shows v2 and the timezone field", toolPage.includes("v2") && toolPage.includes("timezone"));
  const changes = await html("/changes");
  check("UI: changes page shows the deploy, the gate, and the requester", changes.includes("Deployed") && changes.includes("Deploy gate: passed") && changes.includes("maria") && changes.includes("claude-desktop"));
  const audit = await html("/audit");
  check("UI: audit log shows person and agent for runs", audit.includes("maria") && audit.includes("claude-desktop"));
  check("UI: unknown tool is a 404", (await fetch(base + "/tools/nope")).status === 404);

  await sarah.client.close();
  await maria.client.close();
} catch (e) {
  failures++;
  console.log("FAIL  unexpected error:", (e as Error).message);
} finally {
  server.kill("SIGTERM");
  fs.rmSync(home, { recursive: true, force: true });
}
console.log(failures === 0 ? "\nE2E: all checks passed" : `\nE2E: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
