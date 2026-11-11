# Demo guide

The video shows four beats on one protagonist: Sarah's branch finance report.

## Before filming

```bash
npm install
npm run demo:seed -- --fresh                # data + the tool already published as Sarah (the reliable default)
npm run build && npm start                  # film against the production build, not `next dev`
npm run demo:setup                          # writes demo/.runtime/{sarah,maria}
npm run eval:creator -- --runs 5            # film the finale live only if it prints "film the finale live"
```

**Live finale status (measured 2026-11-11).** With `ANTHROPIC_API_KEY` in `.env.local`, the creator agent is Claude Sonnet 5.5 at medium effort. `npm run eval:creator` passed 5 of 5 live runs at 11 to 13 s each ("film the finale live"), and the HTTP end-to-end test passed with the live creator through the production server (v2 deployed in 12 s). Re-run the eval on filming day. If a live call fails or times out, it falls back to the labeled cached decision. The GMI Router backend is still available (`GMI_API_KEY`); in quality mode it passed only 1 to 2 of 5 (slow model choices and timeouts), so it is off by default.

**Publishing live in beat 1 is optional, and risky.** The gate only passes a later change when the fixtures were sent at publish, and the cached fallback only applies when the tool's source is exactly `tools/branch-report/v1.py`. If Claude Code re-types the script and changes a character, or drops the fixtures, beat 4 shows an error or a blocked change on camera. To use the live path, start from an empty catalog with `npm run demo:seed -- --fresh --no-publish`, rehearse it once, and confirm the stored source matches before filming:

```bash
sqlite3 data/townhall.db "select source from versions where tool_id='branch-finance-report' and version=1" | sed '$d' | diff - tools/branch-report/v1.py
```

If the diff prints nothing and the changes page shows the gate passing on a rehearsal change, the live publish is safe to film. Otherwise film beat 1 on a scratch tool and run the rest on the seeded one.

Open `http://localhost:3000` for the human interface. Reset between takes with `npm run demo:seed -- --fresh` (add `--no-publish` for the live-publish path); the server can keep running.

Start the two agent sessions in separate terminals:

```bash
cd demo/.runtime/sarah && claude --add-dir ../../..   # Sarah's Claude Code (publisher)
cd demo/.runtime/maria && claude                      # the colleague's agent (consumer)
```

Claude Code may ask you to approve the project MCP server the first time. Each config sends `X-Townhall-User` and `X-Townhall-Agent` headers, which is how Town Hall knows who is calling.

## Run of show

1. **Publish (Sarah's Claude Code), live path only.** With the seeded default, show the tool already in the catalog instead, or film this beat on a scratch tool. Ask: *"Publish tools/branch-report/v1.py to Town Hall as 'Branch finance report'. It reads the branch databases (read only). Use fixtures [{"month":"2026-10"}] and an expectation that inputs {"month":"2026-10","timezone":"Asia/Jakarta"} gives grand_total 1542360."* The tool appears in the catalog with its schema.
2. **Use (the colleague).** Ask: *"Give me the branch finance report."* It should search, read the schema, ask which month, run it, and show the totals. Then ask it to *"read the branch databases directly"* to show the refusal (see Demo policy below).
3. **Human (browser).** Search the catalog, open the tool, run it from the generated form, then show the Audit page (person and agent for every run).
4. **Collaborate (the colleague).** Ask: *"Run it again, but cut the month off at Asia/Jakarta midnight."* The tool has no timezone input, so the agent calls `request_change`. Show the Changes page: the creator's reasoning, the five-check deploy gate, the diff. Then the agent calls `get_tool`, sees `timezone`, and reruns: the October total moves from 1,620,060 to 1,542,360.

If the live publish in beat 1 fails on a take, `npm run demo:seed -- --fresh` resets and publishes the same tool as Sarah.

## Say this, honestly

- Not "sandboxed": tools run as a stripped-environment subprocess (only `PATH` and the data directory), with a hard timeout. It is not a sandbox.
- Not "safe": a change is **fixture-validated**. The source scan is a lint that indirect Python can get around; the fixture runs and recorded totals are the real checks.
- The refusal is **demo policy** on the colleague's session, not operating-system isolation. Say "company policy" on screen.
- The Oct 31 evening transactions were **seeded on purpose** so the timezone change visibly moves the total.
- The "PR" is a change record plus a diff inside Town Hall, not a GitHub PR.
- If the cached decision was used, it says **cached decision** on the Changes page. Never cut a cached result into a take without that label.
- Take rule: record up to N takes and keep the first passing one.

## Demo policy (the refusal)

`npm run demo:setup` writes `demo/.runtime/maria/.claude/settings.json` with deny rules for reading the data directory and for `sqlite3`, `python3`, `cat` and similar. I could not test these rules here (no Claude login in the build environment), so before filming, ask the colleague's agent to read `data/company/jakarta.db` and confirm it is refused. If your Claude Code version rejects a rule's syntax, adjust it in that file; the file is generated and gitignored.

## What is real and what is not

Real: the MCP server, the tool runs, the audit rows, the deploy gate and its fixture runs, versioning with v1 kept, and the schema-driven form. Not real: SSO (a two-user header stub), a vault, scale to zero, a GitHub PR, and OS-level isolation of the tool runs.

## Not verified yet

- The live creator agent (API and CLI backends) has not been exercised: the build environment had no `ANTHROPIC_API_KEY` and the CLI login had expired. Set a key or run `claude login`, then run `npm run eval:creator` to measure it.
- Beat 1 and the Claude Code client sessions have not been run end to end; the MCP side is covered by 20 HTTP checks.
