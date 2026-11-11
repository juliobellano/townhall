import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export type Identity = { user: string; agent: string };

export function identityFromHeaders(headers: Headers): Identity | null {
  const user = headers.get("x-townhall-user")?.trim();
  const agent = headers.get("x-townhall-agent")?.trim();
  if (!user || !agent) return null;
  return { user, agent };
}

/** Builds a fresh MCP server per request (stateless transport). */
export function createTownMcpServer(identity: Identity): McpServer {
  const server = new McpServer({ name: "townhall", version: "0.1.0" });
  server.registerTool(
    "ping",
    { description: "Health check. Echoes who is calling.", inputSchema: { note: z.string().optional() } },
    async ({ note }) => ({
      content: [{ type: "text", text: JSON.stringify({ ok: true, identity, note: note ?? null }) }],
    }),
  );
  return server;
}
