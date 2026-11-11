import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createTownMcpServer, identityFromHeaders } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request): Promise<Response> {
  const identity = identityFromHeaders(req.headers);
  if (!identity) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Missing X-Townhall-User or X-Townhall-Agent header" }, id: null },
      { status: 401 },
    );
  }
  const server = createTownMcpServer(identity);
  // Stateless: a new transport per request, so nothing is lost on dev reloads.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
