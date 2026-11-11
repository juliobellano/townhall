# Town Hall

A cloud for small software: shared company tools that people use from a web UI and that agents use over MCP, with company-style governance (an audit log, an owner for every tool, and an agent-proposed change flow behind a deploy gate).

Read [AGENTS.md](AGENTS.md) for what we are building and why, [DISCUSSION.md](DISCUSSION.md) for the pitch and demo goal, and [docs/designs/town-hall-demo.md](docs/designs/town-hall-demo.md) for the approved design.

## Quick start

Needs a recent Node with the built-in `node:sqlite` (developed on Node 26) and Python 3 with `zoneinfo` (developed on 3.14).

```bash
npm install
npm run demo:seed -- --fresh   # mock company data + the Branch finance report tool
npm run build && npm start     # http://localhost:3000 (MCP at /api/mcp)
```

## Commands

| Command | What it does |
|---|---|
| `npm test` | Vitest: runner, schema, gate, change flow, MCP tools, database (56 tests) |
| `npm run test:py` | Python tests for the protagonist report script (10 tests) |
| `npm run e2e` | Builds, starts a production server on a temp home, plays the demo with two MCP clients over HTTP, checks the pages (20 checks) |
| `npm run eval:creator -- --runs 5 --threshold 4` | Reliability check for the creator agent; tells you whether to film the finale live or use the cached decision |
| `npm run demo:seed` | Seeds data and publishes the canonical tool (`--fresh` resets, `--no-publish` leaves the catalog empty) |
| `npm run demo:setup` | Writes the two demo Claude sessions' MCP configs under `demo/.runtime` |
| `npm run demo:call -- <user> <agent> <tool> '<json>'` | Plays an agent from the terminal |

## Layout

- `src/lib/town/` core library used by both the MCP and the UI: registry, runner, schema, deploy gate, creator agent, changes.
- `src/lib/mcp/server.ts` the five MCP tools. `src/app/api/mcp/route.ts` serves them statelessly over HTTP.
- `src/app/`, `src/components/` the web UI (shadcn/ui and lucide-react only).
- `tools/branch-report/` the protagonist tool: `v1.py`, the hand-made `v2.py`, expected totals, and the cached decision.
- `scripts/` seed data, demo seed and setup, eval, end-to-end test.

## The tool contract

A tool is a Python script that reads JSON inputs on stdin, writes a JSON result on stdout, prints its own input JSON Schema with `--schema`, and on failure prints `{"error": "..."}` and exits non-zero. Town Hall reads the schema from the script, so the spec cannot drift from the code.

## Creator agent backends

`TOWNHALL_CREATOR=auto` (default) tries the Anthropic API (if `ANTHROPIC_API_KEY` is set), then a locked-down Claude Code CLI (no tools, no MCP, empty temp directory), then the stored cached decision, which is always labeled "cached decision" in the UI. Force one with `TOWNHALL_CREATOR=api|cli|cached`.
