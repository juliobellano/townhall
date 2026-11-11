import fs from "node:fs";
import { canAccess } from "@/lib/town/access";
import { getRunFile, getTool } from "@/lib/town/registry";
import { identityFromHeaders } from "@/lib/mcp/server";
import { uiIdentity } from "@/lib/ui-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Downloads a file a tool run returned (for example tax-filing.pdf). Agents identify with the same
 * X-Townhall-User / X-Townhall-Agent headers as the MCP; the web UI uses its "viewing as" person.
 * The person must be allowed to use the run's tool.
 */
export async function GET(req: Request, { params }: { params: Promise<{ runId: string; name: string }> }) {
  const { runId, name } = await params;
  const id = Number(runId);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  const found = getRunFile(id, decodeURIComponent(name));
  if (!found) return new Response("Not found", { status: 404 });
  const tool = getTool(found.toolId);
  if (!tool) return new Response("Not found", { status: 404 });
  const identity = identityFromHeaders(req.headers) ?? (await uiIdentity());
  if (!canAccess(identity, tool)) return new Response(`Access denied: you may not use ${tool.name}.`, { status: 403 });
  let data: Buffer;
  try {
    data = fs.readFileSync(found.path);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": found.file.mimeType,
      "content-length": String(data.length),
      "content-disposition": `attachment; filename="${found.file.name}"`,
      "cache-control": "private, no-store",
    },
  });
}
