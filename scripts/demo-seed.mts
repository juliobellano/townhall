/**
 * Seeds the demo: the mock company data and the canonical tool, published as Sarah.
 *   npm run demo:seed            keep existing data, publish if missing
 *   npm run demo:seed -- --fresh wipe the registry first (tools, runs, changes)
 *   npm run demo:seed -- --fresh --no-publish   empty catalog, so beat 1 publishes live
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { getDb } from "../src/lib/town/db";
import { dataDir, homeDir } from "../src/lib/town/paths";
import { getTool, publishTool } from "../src/lib/town/registry";

const root = path.resolve(import.meta.dirname, "..");
const read = (f: string) => fs.readFileSync(path.join(root, "tools", "branch-report", f), "utf8");

if (process.argv.includes("--fresh")) {
  // Clear the tables rather than deleting the file, so a running server keeps working between takes.
  const db = getDb();
  for (const t of ["changes", "runs", "versions", "tools"]) db.exec(`DELETE FROM ${t}`);
  fs.rmSync(path.join(homeDir(), "tools"), { recursive: true, force: true });
  console.log("cleared tools, versions, runs and changes (the server can keep running)");
}
if (!fs.existsSync(path.join(dataDir(), "jakarta.db"))) {
  execFileSync("python3", [path.join(root, "scripts", "seed_data.py"), dataDir()], { stdio: "inherit" });
}
if (process.argv.includes("--no-publish")) {
  console.log("catalog left empty (--no-publish): beat 1 publishes the tool live");
} else if (getTool("branch-finance-report")) {
  console.log("tool already published: branch-finance-report");
} else {
  const res = await publishTool(
    {
      name: "Branch finance report",
      description: "Monthly sales totals per branch, read from the company branch databases. Returns the same report every time.",
      owner: "sarah",
      touches: ["branch databases (read only)"],
      source: read("v1.py"),
      checks: {
        fixtures: [{ inputs: { month: "2026-10" } }, { inputs: { month: "2026-10", branches: ["taipei"] } }],
        expectations: [{ inputs: { month: "2026-10", timezone: "Asia/Jakarta" }, expect: { grand_total: 1542360, timezone: "Asia/Jakarta" } }],
      },
    },
    { user: "sarah", agent: "claude-code" },
  );
  console.log(res.ok ? `published ${res.tool.id} v${res.tool.latestVersion} (owner ${res.tool.owner})` : `publish failed: ${res.error}`);
  if (!res.ok) process.exit(1);
}
