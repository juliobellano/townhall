/**
 * Seeds the demo: the mock company data and two tools published as Sarah (Engineering):
 * the tax filing report (Engineering and Sales) and an on-call lookup (Engineering only).
 *   npm run demo:seed            keep existing data, publish if missing
 *   npm run demo:seed -- --fresh wipe the registry first (tools, runs, changes)
 *   npm run demo:seed -- --fresh --no-publish   empty catalog, so beat 1 publishes live
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { getDb } from "../src/lib/town/db";
import { dataDir, homeDir } from "../src/lib/town/paths";
import { getTool, publishTool, type PublishArgs } from "../src/lib/town/registry";

const root = path.resolve(import.meta.dirname, "..");
const read = (folder: string, f: string) => fs.readFileSync(path.join(root, "tools", folder, f), "utf8");

if (process.argv.includes("--fresh")) {
  // Clear the tables rather than deleting the file, so a running server keeps working between takes.
  const db = getDb();
  for (const t of ["changes", "runs", "versions", "tools"]) db.exec(`DELETE FROM ${t}`);
  fs.rmSync(path.join(homeDir(), "tools"), { recursive: true, force: true });
  fs.rmSync(path.join(homeDir(), "files"), { recursive: true, force: true });
  console.log("cleared tools, versions, runs, changes and returned files (the server can keep running)");
}
if (!fs.existsSync(path.join(dataDir(), "jakarta.db"))) {
  execFileSync("python3", [path.join(root, "scripts", "seed_data.py"), dataDir()], { stdio: "inherit" });
}
const SEED: { id: string; folder: string; args: Omit<PublishArgs, "source"> }[] = [
  {
    id: "tax-filing-report",
    folder: "branch-report",
    args: {
      name: "Tax filing report",
      description: "Monthly sales totals per branch, read from the company branch databases. Returns the same report every time.",
      owner: "sarah",
      touches: ["branch databases (read only)"],
      access: ["engineering", "sales"],
      checks: {
        fixtures: [{ inputs: { month: "2026-10" } }, { inputs: { month: "2026-10", branches: ["taipei"] } }],
        expectations: [
          { inputs: { month: "2026-10", timezone: "Asia/Jakarta" }, expect: { grand_total: 1542360, timezone: "Asia/Jakarta" } },
          { inputs: { month: "2026-10", threshold_usd: 100000 }, expect: { grand_total: 1620060, filing_threshold_usd: 100000 } },
        ],
      },
    },
  },
  {
    id: "on-call-lookup",
    folder: "oncall-lookup",
    args: {
      name: "On-call lookup",
      description: "Who is on call for a service this week, their backup, the runbook, and where to escalate. Engineering only.",
      owner: "sarah",
      touches: ["on-call rota (mock)"],
      access: ["engineering"],
      checks: { fixtures: [{ inputs: { service: "payments" } }] },
    },
  },
];

if (process.argv.includes("--no-publish")) {
  console.log("catalog left empty (--no-publish): beat 1 publishes the tool live");
} else {
  for (const t of SEED) {
    if (getTool(t.id)) {
      console.log(`tool already published: ${t.id}`);
      continue;
    }
    const res = await publishTool({ ...t.args, source: read(t.folder, "v1.py") }, { user: "sarah", agent: "claude-code" });
    console.log(res.ok ? `published ${res.tool.id} v${res.tool.latestVersion} (owner ${res.tool.owner}, access ${res.tool.access.join(", ") || "everyone"})` : `publish failed: ${res.error}`);
    if (!res.ok) process.exit(1);
  }
}
