/**
 * Creator-agent reliability eval. Runs the whole change flow N times on fresh data and
 * counts how many LIVE runs pass the deploy gate and the recorded totals.
 *   npm run eval:creator -- --runs 5 --threshold 4
 * Film the finale live only if the live pass count meets the threshold; otherwise use
 * the cached decision, labeled on screen. Backend selection follows TOWNHALL_CREATOR
 * (auto: gmi if GMI_API_KEY is set, then api if ANTHROPIC_API_KEY is set, then the locked-down CLI, then cached).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { requestChange } from "../src/lib/town/changes";
import { resetDb } from "../src/lib/town/db";
import { publishTool, runTool } from "../src/lib/town/registry";

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const runs = arg("runs", 5);
const threshold = arg("threshold", 4);
const root = path.resolve(import.meta.dirname, "..");
try {
  process.loadEnvFile(path.join(root, ".env.local")); // GMI_API_KEY etc.; the file is gitignored
} catch {}
const v1 = fs.readFileSync(path.join(root, "tools", "branch-report", "v1.py"), "utf8");
const NEED = "I need a timezone input so the month cutoff matches my branch's local midnight (for example Asia/Jakarta).";

let live = 0;
let cachedRuns = 0;
for (let i = 1; i <= runs; i++) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "townhall-eval-"));
  process.env.TOWNHALL_HOME = home;
  process.env.TOWNHALL_DATA_DIR = path.join(home, "company");
  execFileSync("python3", [path.join(root, "scripts", "seed_data.py"), process.env.TOWNHALL_DATA_DIR], { stdio: "pipe" });
  resetDb();
  const pub = await publishTool(
    {
      name: "Tax filing report",
      description: "Monthly sales totals per branch from the company branch databases.",
      source: v1,
      checks: {
        fixtures: [{ inputs: { month: "2026-10" } }],
        expectations: [{ inputs: { month: "2026-10", timezone: "Asia/Jakarta" }, expect: { grand_total: 1542360 } }],
      },
    },
    { user: "eval", agent: "eval" },
  );
  if (!pub.ok) throw new Error(pub.error);
  const started = Date.now();
  const c = await requestChange({ toolId: pub.tool.id, need: NEED }, { user: "eval", agent: "eval" });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if ("ok" in c) {
    console.log(`run ${i}: request failed: ${c.error}`);
  } else {
    let totalOk = false;
    if (c.status === "deployed") {
      const r = await runTool({ id: pub.tool.id, inputs: { month: "2026-10", timezone: "Asia/Jakarta" } }, { user: "eval", agent: "eval" });
      totalOk = r.ok && (r.output as { grand_total: number }).grand_total === 1542360;
    }
    const pass = c.status === "deployed" && totalOk;
    if (pass && !c.cached) live++;
    if (c.cached) cachedRuns++;
    const failed = c.gate?.checks.filter((x) => !x.pass).map((x) => `${x.name}: ${x.detail.slice(0, 160)}`).join("; ");
    console.log(`run ${i}: ${pass ? "PASS" : "FAIL"} status=${c.status} backend=${c.backend ?? "-"}${c.cached ? " (cached)" : ""} ${secs}s${failed ? ` failed=[${failed}]` : ""}${c.notes.length ? ` notes=${c.notes.join(" | ")}` : ""}${c.status !== "deployed" && c.reason ? `\n      reason: ${c.reason}` : ""}`);
  }
  resetDb();
  fs.rmSync(home, { recursive: true, force: true });
}
console.log(`\nlive passes: ${live}/${runs} (threshold ${threshold}); runs that used the cached decision: ${cachedRuns}`);
if (live >= threshold) {
  console.log("VERDICT: film the finale live.");
} else {
  console.log("VERDICT: use the cached decision, labeled on screen.");
  process.exit(1);
}
