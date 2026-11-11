import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiBackend, backendOrder, gmiBackend, parseTagged, reviewWithCreator, type CreatorRequest } from "@/lib/town/creator";
import { readTool } from "./helpers";

const req: CreatorRequest = {
  toolId: "tax-filing-report",
  toolName: "Tax filing report",
  toolDescription: "Monthly totals per branch.",
  currentSource: readTool("v1.py"),
  currentSchema: { type: "object", properties: { month: { type: "string" } }, required: ["month"] },
  need: "I need a timezone input for the month cutoff.",
};
const v2 = readTool("v2.py");

describe("parseTagged", () => {
  it("parses an accept with the full source", () => {
    const d = parseTagged(`<decision>accept</decision>\n<reason> Optional field, default UTC. </reason>\n<new_source>\n${v2}</new_source>`);
    expect(d).toMatchObject({ decision: "accept", reason: "Optional field, default UTC." });
    expect(d.newSource).toBe(v2);
  });
  it("strips markdown fences the model added anyway", () => {
    const d = parseTagged("<decision>accept</decision><reason>ok</reason><new_source>\n```python\nprint('x')\n```\n</new_source>");
    expect(d.newSource).toBe("print('x')\n");
  });
  it("parses a rejection with no source", () => {
    expect(parseTagged("<decision>REJECT</decision><reason>Needs more data access.</reason>")).toEqual({ decision: "reject", reason: "Needs more data access.", newSource: undefined });
  });
  it("throws on missing tags, an unknown decision, or an accept with no source", () => {
    expect(() => parseTagged("Sure! Here is the new code.")).toThrow();
    expect(() => parseTagged("<decision>maybe</decision><reason>x</reason>")).toThrow();
    expect(() => parseTagged("<decision>accept</decision><reason>x</reason>")).toThrow(/no source/);
  });
});

describe("gmiBackend (network mocked)", () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    process.env.GMI_API_KEY = "test-key-abc123";
    delete process.env.GMI_ROUTER_MODE;
    delete process.env.GMI_ROUTER_URL;
  });
  afterEach(() => {
    process.env = { ...OLD };
    vi.unstubAllGlobals();
  });
  const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
  const text = `<decision>accept</decision><reason>Low risk.</reason><new_source>\n${v2}</new_source>`;

  it("posts to the router in quality mode with a bearer key, and reads the top-level message shape", async () => {
    const fetchMock = reply({ model: "google/gemini-3.6-flash", message: { role: "assistant", content: text }, routing_metadata: { selected_model: "google/gemini-3.6-flash" } });
    vi.stubGlobal("fetch", fetchMock);
    const d = await gmiBackend(req, new AbortController().signal);
    expect(d).toMatchObject({ decision: "accept", model: "google/gemini-3.6-flash" });
    expect(d.newSource).toBe(v2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://console.gmicloud.ai/api/v1/ie/recommendation/autoroute");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key-abc123");
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({ mode: "quality", stream: false });
    expect(sent.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
    expect(sent.messages[1].content).toContain("<request>");
    expect(sent.messages[1].content).toContain(req.need);
  });
  it("also reads the OpenAI-style choices shape, and honors GMI_ROUTER_MODE", async () => {
    process.env.GMI_ROUTER_MODE = "balanced";
    const fetchMock = reply({ choices: [{ message: { content: text } }] });
    vi.stubGlobal("fetch", fetchMock);
    expect((await gmiBackend(req, new AbortController().signal)).decision).toBe("accept");
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).mode).toBe("balanced");
  });
  it("fails clearly without a key, and never leaks the key in an error", async () => {
    delete process.env.GMI_API_KEY;
    await expect(gmiBackend(req, new AbortController().signal)).rejects.toThrow(/GMI_API_KEY is not set/);
    process.env.GMI_API_KEY = "test-key-abc123";
    vi.stubGlobal("fetch", reply('{"error":"bad key test-key-abc123"}', 401));
    const err = await gmiBackend(req, new AbortController().signal).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/HTTP 401/);
    expect((err as Error).message).not.toContain("test-key-abc123");
  });
  it("fails on non-JSON replies and replies with no content", async () => {
    vi.stubGlobal("fetch", reply("<html>gateway</html>"));
    await expect(gmiBackend(req, new AbortController().signal)).rejects.toThrow(/did not return JSON/);
    vi.stubGlobal("fetch", reply({ model: "x" }));
    await expect(gmiBackend(req, new AbortController().signal)).rejects.toThrow(/no message content/);
  });
  it("labels the result with the model the router chose", async () => {
    vi.stubGlobal("fetch", reply({ message: { content: text }, routing_metadata: { selected_model: "openai/gpt-5.5" } }));
    const res = await reviewWithCreator(req, { order: ["gmi"] });
    expect(res).toMatchObject({ backend: "gmi:openai/gpt-5.5", cached: false });
    expect(res.decision.model).toBeUndefined();
  });
});

describe("apiBackend (network mocked under the real SDK)", () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    delete process.env.TOWNHALL_CREATOR_MODEL;
    delete process.env.TOWNHALL_CREATOR_EFFORT;
  });
  afterEach(() => {
    process.env = { ...OLD };
    vi.unstubAllGlobals();
  });
  const message = (decision: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5",
          content: [{ type: "text", text: JSON.stringify(decision) }],
          stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 }, ...extra,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

  it("asks Sonnet 5.5 at medium effort for a JSON-schema decision, with fallbacks and no forced tool_choice", async () => {
    const fetchMock = message({ decision: "accept", reason: "Optional field, default UTC.", new_source: v2 });
    vi.stubGlobal("fetch", fetchMock);
    const d = await apiBackend(req, new AbortController().signal);
    expect(d).toMatchObject({ decision: "accept", model: "claude-sonnet-5-5" });
    expect(d.newSource).toBe(v2);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.output_config.effort).toBe("medium");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.fallbacks).toBe("default");
    expect(body.tool_choice).toBeUndefined();
    expect(body.thinking).toBeUndefined(); // adaptive by default on Sonnet 5.5
    expect(body.messages[0].content).toContain("<request>");
    expect(String(new Headers(init.headers).get("anthropic-beta"))).toContain("server-side-fallback-2026-07-01");
  });
  it("honors TOWNHALL_CREATOR_MODEL and TOWNHALL_CREATOR_EFFORT", async () => {
    process.env.TOWNHALL_CREATOR_MODEL = "claude-opus-5-5";
    process.env.TOWNHALL_CREATOR_EFFORT = "high";
    const fetchMock = message({ decision: "reject", reason: "Needs new data access.", new_source: "" });
    vi.stubGlobal("fetch", fetchMock);
    expect(await apiBackend(req, new AbortController().signal)).toMatchObject({ decision: "reject", newSource: undefined });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ model: "claude-opus-5-5", output_config: { effort: "high" } });
  });
  it("turns a refusal into an error so the cached decision takes over", async () => {
    vi.stubGlobal("fetch", message({ decision: "accept", reason: "x", new_source: v2 }, { stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: "x" } }));
    await expect(apiBackend(req, new AbortController().signal)).rejects.toThrow(/declined \(cyber\)/);
  });
});

describe("time budget", () => {
  it("reads TOWNHALL_CREATOR_TIMEOUT_MS when no timeout is passed", async () => {
    process.env.TOWNHALL_CREATOR_TIMEOUT_MS = "150";
    const res = reviewWithCreator(req, { backends: { slow: () => new Promise(() => {}) }, order: ["slow"] });
    await expect(res).rejects.toThrow(/slow: timed out/);
    delete process.env.TOWNHALL_CREATOR_TIMEOUT_MS;
  });
});

describe("SYSTEM_PROMPT", () => {
  it("states the same import allowlist the deploy gate enforces, so the agent does not refuse what the platform allows", async () => {
    const { SYSTEM_PROMPT } = await import("@/lib/town/creator");
    const { ALLOWED_NEW_IMPORTS } = await import("@/lib/town/gate");
    for (const mod of ALLOWED_NEW_IMPORTS) expect(SYSTEM_PROMPT).toContain(mod);
    expect(SYSTEM_PROMPT).toMatch(/zoneinfo module is allowed/);
  });
});

describe("backendOrder", () => {
  it("puts gmi first when its key is set, then api, cli, cached", () => {
    expect(backendOrder({ GMI_API_KEY: "k", ANTHROPIC_API_KEY: "a" } as never)).toEqual(["gmi", "api", "cli", "cached"]);
    expect(backendOrder({ GMI_API_KEY: "k" } as never)).toEqual(["gmi", "cli", "cached"]);
    expect(backendOrder({} as never)).toEqual(["cli", "cached"]);
  });
  it("lets TOWNHALL_CREATOR force a single backend", () => {
    expect(backendOrder({ TOWNHALL_CREATOR: "cached", GMI_API_KEY: "k" } as never)).toEqual(["cached"]);
    expect(backendOrder({ TOWNHALL_CREATOR: "auto", GMI_API_KEY: "k" } as never)).toEqual(["gmi", "cli", "cached"]);
  });
});
