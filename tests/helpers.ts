import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { resetDb } from "@/lib/town/db";

export const ROOT = path.resolve(__dirname, "..");
export const readTool = (file: string) => fs.readFileSync(path.join(ROOT, "tools", "branch-report", file), "utf8");
export const expected = JSON.parse(readTool("expected.json")) as Record<string, Record<string, { total: number; transactions: number }> & { grand_total: number }>;

/** Fresh TOWNHALL_HOME and a seeded company data dir; returns a cleanup function. */
export function setupTown(): { home: string; cleanup: () => void } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "townhall-test-"));
  const data = path.join(home, "company");
  execFileSync("python3", [path.join(ROOT, "scripts", "seed_data.py"), data], { stdio: "pipe" });
  process.env.TOWNHALL_HOME = home;
  process.env.TOWNHALL_DATA_DIR = data;
  resetDb();
  return {
    home,
    cleanup: () => {
      resetDb();
      fs.rmSync(home, { recursive: true, force: true });
      delete process.env.TOWNHALL_HOME;
      delete process.env.TOWNHALL_DATA_DIR;
    },
  };
}

export function writeScript(dir: string, name: string, body: string): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, body);
  return file;
}

export const sarah = { user: "sarah", agent: "claude-code" };
export const maria = { user: "maria", agent: "claude-desktop" };

export const BRANCH_REPORT_CHECKS = {
  fixtures: [{ inputs: { month: "2026-10" } }, { inputs: { month: "2026-10", branches: ["taipei"] } }],
  expectations: [{ inputs: { month: "2026-10", timezone: "Asia/Jakarta" }, expect: { grand_total: 1542360, timezone: "Asia/Jakarta" } }],
};
