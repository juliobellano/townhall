/**
 * Generates the two demo Claude Code sessions' configs under demo/.runtime (gitignored), with
 * absolute paths. It writes files only; it does not touch any user-level or global Claude settings.
 *   npm run demo:setup
 *   cd demo/.runtime/sarah && claude     # Sarah's Claude Code: publishes tools
 *   cd demo/.runtime/maria && claude     # Maria's Claude Desktop stand-in: finds and uses tools
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const url = process.env.TOWNHALL_URL ?? "http://localhost:3000/api/mcp";
const dataDir = process.env.TOWNHALL_DATA_DIR ?? path.join(root, "data", "company");
const out = path.join(root, "demo", ".runtime");

const write = (file: string, body: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(body, null, 2) + "\n");
  console.log("wrote", path.relative(root, file));
};

const mcp = (user: string, agent: string) => ({
  mcpServers: { townhall: { type: "http", url, headers: { "X-Townhall-User": user, "X-Townhall-Agent": agent } } },
});

write(path.join(out, "sarah", ".mcp.json"), mcp("sarah", "claude-code"));
write(path.join(out, "maria", ".mcp.json"), mcp("maria", "claude-desktop"));

// Demo policy for the colleague's session: no direct access to the company data. This is a
// policy layer on the agent's tools, not OS isolation, and it can be bypassed by determined
// indirect means. Test it before filming, and label it "company policy" on screen.
write(path.join(out, "maria", ".claude", "settings.json"), {
  permissions: {
    deny: [
      `Read(/${dataDir}/**)`,
      "Bash(sqlite3 *)",
      "Bash(python3 *)",
      "Bash(python *)",
      "Bash(cat *)",
      "Bash(head *)",
      "Bash(strings *)",
      "Bash(cp *)",
    ],
  },
});
console.log(`\nData directory the colleague must not read directly: ${dataDir}`);
console.log("Next: start the server (npm run build && npm start), then launch each session from its folder.");
