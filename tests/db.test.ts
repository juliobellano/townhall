import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/town/db";
import { publishTool, searchTools } from "@/lib/town/registry";
import { readTool, sarah, setupTown } from "./helpers";

let home: string;
let cleanup: () => void;
beforeAll(() => {
  ({ home, cleanup } = setupTown());
});
afterAll(() => cleanup());

describe("getDb", () => {
  it("reuses one connection while the file is unchanged", () => {
    expect(getDb()).toBe(getDb());
  });

  it("reopens when the database file is deleted or replaced, instead of reading a ghost", async () => {
    const res = await publishTool({ name: "Ghost test", description: "A tool that should vanish with the file.", source: readTool("v1.py") }, sarah);
    expect(res.ok).toBe(true);
    expect(searchTools().map((t) => t.id)).toContain("ghost-test");
    for (const f of ["townhall.db", "townhall.db-wal", "townhall.db-shm"]) fs.rmSync(path.join(home, f), { force: true });
    expect(searchTools()).toEqual([]); // a fresh, empty database, not the deleted one
    expect(fs.existsSync(path.join(home, "townhall.db"))).toBe(true);
  });
});
