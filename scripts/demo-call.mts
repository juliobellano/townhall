/**
 * Plays an agent from the terminal, for rehearsal and for checking the UI without a Claude client.
 *   npm run demo:call -- <user> <agent> <tool> '<json args>'
 * Example:
 *   npm run demo:call -- maria claude-desktop run_tool '{"id":"branch-finance-report","inputs":{"month":"2026-10"}}'
 *   npm run demo:call -- maria claude-desktop request_change '{"id":"branch-finance-report","need":"I need a timezone input"}'
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const [user, agent, tool, argsJson] = process.argv.slice(2);
if (!user || !agent || !tool) {
  console.error("usage: demo-call <user> <agent> <tool> '<json args>'");
  process.exit(2);
}
const url = process.env.TOWNHALL_URL ?? "http://localhost:3000/api/mcp";
const client = new Client({ name: agent, version: "0" });
await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { "x-townhall-user": user, "x-townhall-agent": agent } } }));
const res = (await client.callTool({ name: tool, arguments: argsJson ? JSON.parse(argsJson) : {} })) as { isError?: boolean; content: { text: string }[] };
console.log(res.content[0].text);
await client.close();
process.exit(res.isError ? 1 : 0);
