import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.TOWNHALL_URL ?? "http://localhost:3000/api/mcp";
const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { "x-townhall-user": "sarah", "x-townhall-agent": "claude-code" } },
});
const client = new Client({ name: "spike", version: "0.0.1" });
await client.connect(transport);
console.log("tools:", (await client.listTools()).tools.map((t) => t.name));
const res = await client.callTool({ name: "ping", arguments: { note: "hello" } });
console.log("ping:", JSON.stringify(res.content));
await client.close();
