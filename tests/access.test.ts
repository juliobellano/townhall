import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { accessLabel, canAccess, departmentOf, normalizeAccess } from "@/lib/town/access";
import { requestChange } from "@/lib/town/changes";
import { getDb, resetDb } from "@/lib/town/db";
import { getToolFor, listRuns, publishTool, runTool, searchTools, searchToolsFor } from "@/lib/town/registry";
import { createTownMcpServer, type Identity } from "@/lib/mcp/server";
import type { Check } from "@/lib/town/types";
import { BRANCH_REPORT_CHECKS, maria, readTool, sarah, setupTown } from "./helpers";

const alex = { user: "alex", agent: "claude-desktop" }; // Marketing
const priya = { user: "priya", agent: "claude-desktop" }; // Legal
const stranger = { user: "nobody", agent: "claude-desktop" }; // not in the directory
const oncall = fs.readFileSync(path.join(__dirname, "..", "tools", "oncall-lookup", "v1.py"), "utf8");

let home: string;
let cleanup: () => void;
beforeAll(async () => {
  ({ home, cleanup } = setupTown());
  // Sarah (Engineering) publishes an engineering-only tool, a tax filing tool for Engineering and Sales, and an open one.
  const seed: [string, string, string[] | undefined, Check][] = [
    ["On-call lookup", oncall, ["engineering"], { fixtures: [{ inputs: { service: "payments" } }] }],
    ["Tax filing report", readTool("v1.py"), ["sales", "engineering"], BRANCH_REPORT_CHECKS],
    ["Open report", readTool("v1.py"), undefined, BRANCH_REPORT_CHECKS],
  ];
  for (const [name, source, access, checks] of seed) {
    const res = await publishTool({ name, description: `${name} (access test tool).`, source, access, checks }, sarah);
    if (!res.ok) throw new Error(res.error);
  }
});
afterAll(() => cleanup());

describe("the mock directory and rule", () => {
  it("maps people to departments", () => {
    expect(departmentOf("sarah")).toBe("engineering");
    expect(departmentOf("maria")).toBe("sales");
    expect(departmentOf("alex")).toBe("marketing");
    expect(departmentOf("priya")).toBe("legal");
    expect(departmentOf("nobody")).toBeNull();
  });

  it("lets the owner, listed departments, and everyone on an open tool in", () => {
    const tool = { owner: "sarah", access: ["legal"] };
    expect(canAccess(sarah, tool)).toBe(true); // owner, though not in Legal
    expect(canAccess(priya, tool)).toBe(true);
    expect(canAccess(alex, tool)).toBe(false);
    expect(canAccess(stranger, { owner: "sarah", access: [] })).toBe(true);
    expect(canAccess(stranger, tool)).toBe(false);
  });

  it("accepts only known departments, deduplicated, in directory order", () => {
    expect(normalizeAccess(["sales", "engineering", "sales"])).toEqual({ ok: true, access: ["engineering", "sales"] });
    expect(normalizeAccess(undefined)).toEqual({ ok: true, access: [] });
    expect(normalizeAccess(["finance"]).ok).toBe(false);
    expect(accessLabel([])).toBe("Everyone");
    expect(accessLabel(["engineering", "sales"])).toBe("Engineering, Sales");
  });
});

describe("publishing with access", () => {
  it("stores the access list and rejects an unknown department", async () => {
    expect(searchTools("on-call")[0].access).toEqual(["engineering"]);
    expect(searchTools("tax filing")[0].access).toEqual(["engineering", "sales"]);
    const bad = await publishTool({ name: "Bad access", description: "Has a department that does not exist.", source: oncall, access: ["finance"] }, sarah);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("invalid_request");
  });
});

describe("enforcement", () => {
  it("search only returns tools the person may use", () => {
    const ids = (who: Identity) => searchToolsFor(who).map((t) => t.id).sort();
    expect(ids(sarah)).toEqual(["on-call-lookup", "open-report", "tax-filing-report"]);
    expect(ids(maria)).toEqual(["open-report", "tax-filing-report"]);
    expect(ids(alex)).toEqual(["open-report"]);
    expect(ids(stranger)).toEqual(["open-report"]);
  });

  it("get is forbidden with a reason that names the departments and the person's", () => {
    const res = getToolFor("on-call-lookup", alex);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("forbidden");
    expect(res.error).toMatch(/restricted to Engineering/);
    expect(res.error).toMatch(/alex is in Marketing/);
    expect(getToolFor("nope", alex)).toMatchObject({ ok: false, code: "not_found" });
    expect(getToolFor("on-call-lookup", sarah).ok).toBe(true);
  });

  it("a refused run does not execute, and is audited as denied (pinned versions too)", async () => {
    const res = await runTool({ id: "on-call-lookup", inputs: { service: "payments" } }, alex);
    expect(res).toMatchObject({ ok: false, code: "forbidden" });
    const pinned = await runTool({ id: "on-call-lookup", version: 1, inputs: { service: "payments" } }, maria);
    expect(pinned).toMatchObject({ ok: false, code: "forbidden" });
    const runs = listRuns(10, "on-call-lookup");
    expect(runs.slice(0, 2).map((r) => [r.person, r.ok, r.denied])).toEqual([
      ["maria", false, true],
      ["alex", false, true],
    ]);
    const ok = await runTool({ id: "on-call-lookup", inputs: { service: "payments" } }, sarah);
    expect(ok).toMatchObject({ ok: true, output: { on_call: "sarah" } });
    expect(listRuns(1, "on-call-lookup")[0]).toMatchObject({ ok: true, denied: false });
  });

  it("Sales can use the tax filing report; Marketing cannot", async () => {
    expect((await runTool({ id: "tax-filing-report", inputs: { month: "2026-10" } }, maria)).ok).toBe(true);
    expect(await runTool({ id: "tax-filing-report", inputs: { month: "2026-10" } }, alex)).toMatchObject({ code: "forbidden" });
  });

  it("request_change is refused before the creator agent is asked", async () => {
    let asked = false;
    const res = await requestChange({ toolId: "on-call-lookup", need: "Please add a timezone input to this tool." }, alex, {
      creator: async () => {
        asked = true;
        throw new Error("must not be called");
      },
    });
    expect(res).toMatchObject({ ok: false, code: "forbidden" });
    expect(asked).toBe(false);
  });
});

describe("over MCP", () => {
  async function connect(identity: Identity) {
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createTownMcpServer(identity).connect(b);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(a);
    return async (name: string, args: Record<string, unknown>) => {
      const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
      const text = res.content[0].text;
      let body: Record<string, any>;
      try {
        body = JSON.parse(text);
      } catch {
        body = { text }; // input validation errors from the MCP layer are plain text
      }
      return { isError: !!res.isError, body };
    };
  }

  it("hides restricted tools from search and refuses get_tool and run_tool", async () => {
    const call = await connect(alex);
    const found = await call("search_tools", {});
    expect(found.body.tools.map((t: { id: string }) => t.id)).toEqual(["open-report"]);
    const got = await call("get_tool", { id: "on-call-lookup" });
    expect(got.isError).toBe(true);
    expect(got.body.code).toBe("forbidden");
    const ran = await call("run_tool", { id: "on-call-lookup", inputs: { service: "auth" } });
    expect(ran.isError).toBe(true);
    expect(ran.body.code).toBe("forbidden");
  });

  it("publish_tool takes an access list and rejects an unknown department", async () => {
    const call = await connect(priya);
    const ok = await call("publish_tool", { name: "Contract lookup", description: "Legal-only test tool for access control.", source: oncall, access: ["legal"] });
    expect(ok.isError).toBe(false);
    expect(ok.body.tool.access).toEqual(["legal"]);
    const bad = await call("publish_tool", { name: "Bad dept", description: "Unknown department in access.", source: oncall, access: ["finance"] });
    expect(bad.isError).toBe(true);
    expect(bad.body.text).toMatch(/access/);
  });
});

describe("databases from before access control", () => {
  it("gain the access column on open, and existing tools stay open to everyone", () => {
    resetDb();
    for (const f of ["townhall.db", "townhall.db-wal", "townhall.db-shm"]) fs.rmSync(path.join(home, f), { force: true });
    const old = new DatabaseSync(path.join(home, "townhall.db"));
    old.exec(
      "CREATE TABLE tools (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, owner TEXT NOT NULL, touches TEXT NOT NULL DEFAULT '[]', checks TEXT NOT NULL DEFAULT '{}', latest_version INTEGER NOT NULL, created_at TEXT NOT NULL)",
    );
    old.exec("INSERT INTO tools VALUES ('legacy', 'Legacy', 'An old tool.', 'sarah', '[]', '{}', 1, '2026-01-01')");
    old.close();
    getDb();
    expect(searchTools()[0]).toMatchObject({ id: "legacy", access: [] });
    expect(searchToolsFor(alex).map((t) => t.id)).toEqual(["legacy"]);
  });
});
