import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { requestChange } from "../town/changes";
import { DEPARTMENTS } from "../town/access";
import { getToolFor, getVersion, publishTool, runTool, searchToolsFor } from "../town/registry";
import type { Identity } from "../town/types";

export type { Identity };

export function identityFromHeaders(headers: Headers): Identity | null {
  const user = headers.get("x-townhall-user")?.trim();
  const agent = headers.get("x-townhall-agent")?.trim();
  if (!user || !agent) return null;
  return { user, agent };
}

const json = (value: unknown, isError = false) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

const TOOL_CONTRACT = `A Town Hall tool is a Python 3 script (standard library only) that:
1. reads its JSON inputs from stdin,
2. writes its JSON result to stdout,
3. prints its own input JSON Schema (type "object", with "properties" and "required") when run with --schema,
4. on failure prints {"error": "<message>"} to stdout and exits with a non-zero status.
5. may return files (for example a PDF) in the reserved "_files" key of its result: [{"name": "report.pdf", "mime_type": "application/pdf", "base64": "..."}]. Town Hall stores them and returns download links instead of the bytes.
Give new optional inputs a "default" in the schema.`;

/**
 * Builds a fresh MCP server for one request (the transport is stateless). Every tool is
 * generic: schemas are read through get_tool at call time, so a new version never needs
 * re-registering and a client's cached tool list cannot go stale.
 */
export function createTownMcpServer(identity: Identity, opts: { origin?: string } = {}): McpServer {
  const server = new McpServer({ name: "townhall", version: "0.1.0" });

  server.registerTool(
    "search_tools",
    {
      description:
        "Search the company's Town Hall for shared tools. Use this FIRST when you need to do something with company data: a Town Hall tool is the approved, audited way to read it. Results only include tools your user's department may use. Leave query empty to list them all.",
      inputSchema: { query: z.string().optional().describe("Words to look for in tool names and descriptions") },
    },
    async ({ query }) => json({ tools: searchToolsFor(identity, query) }),
  );

  server.registerTool(
    "get_tool",
    {
      description:
        "Get one tool's details: what it does, its owner, what it touches, which departments may use it (access, empty means everyone), its source code (source), and its input schema (inputSchema) for the latest version. Always read the schema before run_tool, and ask the user for any required input you do not have.",
      inputSchema: { id: z.string().describe("Tool id from search_tools") },
    },
    async ({ id }) => {
      const res = getToolFor(id, identity);
      if (!res.ok) return json(res, true);
      // Agents can read the code: the latest version's source, so they can see why a result looks the way it does.
      return json({ tool: { ...res.tool, source: getVersion(res.tool.id, res.tool.latestVersion)?.source ?? null } });
    },
  );

  server.registerTool(
    "run_tool",
    {
      description:
        "Run a tool and get its result. Inputs must match the tool's inputSchema exactly: unknown inputs are rejected, not ignored. The run is audited with your user and agent, including runs refused by access control (code 'forbidden'). Omit version to use the latest. If the tool returns files (for example a PDF), the result lists them under files, each with a download_url and a ready curl command that saves it.",
      inputSchema: {
        id: z.string().describe("Tool id"),
        inputs: z.record(z.string(), z.unknown()).describe("Inputs matching the tool's inputSchema"),
        version: z.number().int().positive().optional().describe("Pin a version. Defaults to the latest."),
      },
    },
    async ({ id, inputs, version }) => {
      const res = await runTool({ id, inputs, version }, identity);
      if (!res.ok) return json(res, true);
      const origin = opts.origin ?? "http://localhost:3000";
      const files = res.files.map((f) => {
        const url = origin + f.url;
        // Only offer a ready command when every part is shell-safe (names are validated; identities come from headers).
        const safe = [identity.user, identity.agent, f.name, url].every((s) => /^[\w.:/%@ -]+$/.test(s));
        const save = safe ? `curl -fsS -H 'X-Townhall-User: ${identity.user}' -H 'X-Townhall-Agent: ${identity.agent}' -o '${f.name}' '${url}'` : undefined;
        return { name: f.name, mime_type: f.mimeType, bytes: f.bytes, download_url: url, save_with: save };
      });
      const body = json({ ...res, files });
      // Also point at each file with a standard MCP resource link.
      for (const f of files) body.content.push({ type: "resource_link", uri: f.download_url, name: f.name, mimeType: f.mime_type } as never);
      return body;
    },
  );

  server.registerTool(
    "request_change",
    {
      description:
        "Ask the tool's creator agent for a change, for example a new input the tool is missing. The creator agent decides. If it accepts and the platform's deploy gate passes, the new version is deployed and you can use it right away (call get_tool again to see the new input). The old version stays available. This can take up to about a minute.",
      inputSchema: {
        id: z.string().describe("Tool id"),
        need: z.string().describe("What you need, in plain words, for example: 'a timezone input so the month cutoff matches Asia/Jakarta'"),
      },
    },
    async ({ id, need }) => {
      const res = await requestChange({ toolId: id, need }, identity);
      if ("ok" in res) return json(res, true);
      const { diff, gate, ...rest } = res;
      return json({ change: rest, gate, diff }, res.status === "error");
    },
  );

  server.registerTool(
    "publish_tool",
    {
      description: `Publish a new tool to Town Hall so colleagues and their agents can use it. ${TOOL_CONTRACT} Town Hall reads the input schema from the script itself, and rejects a script that does not follow this contract, with instructions on how to fix it.`,
      inputSchema: {
        name: z.string().describe("Short tool name, for example 'Tax filing report'"),
        description: z.string().describe("What the tool does and returns, in a sentence or two"),
        source: z.string().describe("The full Python source of the script"),
        touches: z.array(z.string()).optional().describe("What the tool reads or calls, for example ['branch databases (read only)']"),
        owner: z.string().optional().describe("Defaults to you"),
        access: z
          .array(z.enum(DEPARTMENTS))
          .optional()
          .describe("Departments allowed to use the tool, for example [\"engineering\"]. Omit for everyone. The owner can always use it."),
        fixtures: z
          .array(z.record(z.string(), z.unknown()))
          .optional()
          .describe(
            "Example inputs, one object per example, for example [{\"month\": \"2026-10\"}]. When a colleague's agent later asks for a change, a new version must give the same output for these. Strongly recommended: a tool with no fixtures cannot accept auto-deployed changes.",
          ),
        expectations: z
          .array(z.object({ inputs: z.record(z.string(), z.unknown()), expect: z.record(z.string(), z.unknown()) }))
          .optional()
          .describe("Optional recorded results for inputs a future version may add: {inputs, expect} where expect is a partial match on the output."),
      },
    },
    async ({ name, description, source, touches, owner, access, fixtures, expectations }) => {
      const res = await publishTool(
        { name, description, source, touches, owner, access, checks: { fixtures: fixtures?.map((inputs) => ({ inputs })), expectations } },
        identity,
      );
      return res.ok ? json({ ok: true, tool: res.tool }) : json(res, true);
    },
  );

  return server;
}
