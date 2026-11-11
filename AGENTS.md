# Town Hall

Working name. Read this first: it says what we are building and how to onboard messy workflows.

## What we are building

A cloud for small software, in response to YC's "A cloud for small software" request for startups.

Small internal tools are everywhere and critical: customer lookups, admin buttons, weekly query pages, on-call helpers, eval viewers, Slack bots. People build them in an afternoon (now often with an agent), and they stay on one laptop. The code isn't the problem. What blocks sharing is everything around it: company login, safe access to company data, security review, hosting, and nobody owning the tool once its builder moves on.

Town Hall is where those tools go. Deploy one in a click, and it becomes usable by people and by agents, explained automatically, and kept working by the agents that use it.

## What agents want

We are building something agents want, not only something people want. An agent working inside a company needs two things:

- **Compliant tools.** Tools it is allowed to call: company login, scoped access, an audit log, and an owner for every tool. An agent can't safely use a tool that skips governance, so compliance is what makes a tool usable by agents at all.
- **Examples and references for tools inside the company.** The existing tools, with their specs and code, show an agent how things are done here: which data it may read, which patterns are approved, what a good tool looks like. With those references an agent builds and changes tools the company's way instead of guessing.

When a design choice is unclear, ask which option gives agents a tool they are allowed to call, or a reference they can learn from.

## The five must-haves

1. **AI native.** An MCP for the platform and one for every tool, generated at deploy. Agents can read the code, so the spec is written from it and tested against it.
2. **One-tap deployment.** No infra to set up. Scale to zero when idle. Storage and secrets built in.
3. **Access control and governance.** Company login on every tool, roles, scoped read-only data access, an audit log, and an owner for every tool.
4. **Build anywhere.** Import existing tools or vibe code new ones in place. Versions, rollback and fork.
5. **Self-maintaining.** Agents watch for failures, open fixes, keep the spec and MCP in sync, and update dependencies. The owner approves.

## Connecting Claude to the MCP over a tunnel

The MCP is served over HTTP at `/api/mcp` (stateless, see `src/app/api/mcp/route.ts`). It knows who is calling only from two headers, `X-Townhall-User` and `X-Townhall-Agent`, and returns 401 without them.

**Which client needs what:**

- **Claude Code on this machine** needs no tunnel. It sends the headers itself from the `.mcp.json` that `npm run demo:setup` writes (see [demo/README.md](demo/README.md)).
- **Claude (claude.ai, Claude Desktop) custom connector** needs a tunnel, because Anthropic's servers make the connection, not your laptop. It also cannot be relied on to send our headers (custom request headers are a limited beta). So the tunnel adds the identity, and that makes the tunnel URL the login. Gate it with a secret.

**Steps:**

1. Start the server: `npm run build && npm start` (port 3000).
2. Our static ngrok domain is `integral-virtually-pegasus.ngrok-free.app` (reserved on one team member's ngrok account, listed at https://dashboard.ngrok.com/domains). Only that account's ngrok can serve it, so run the tunnel from that machine. Always use this domain: a connector's URL can't be edited, only removed and re-added, so a URL that changes on every restart means re-adding the connector every take.
3. Make a secret with `openssl rand -hex 16`, and save this policy as `demo/.runtime/townhall-tunnel.yml` (gitignored, so the secret stays out of git). Replace `<SECRET>` with it:

   ```yaml
   on_http_request:
     # The URL is the login: only /api/mcp with the right key gets through,
     # and a caller may not send its own identity headers.
     - expressions:
         - "req.url.path != '/api/mcp' || !('key' in req.url.query_params) || !('<SECRET>' in req.url.query_params['key']) || 'x-townhall-user' in req.headers || 'x-townhall-agent' in req.headers"
       actions:
         - type: deny
           config:
             status_code: 404
     # Every request that gets through calls as this person and agent.
     - actions:
         - type: add-headers
           config:
             headers:
               x-townhall-user: maria
               x-townhall-agent: claude-desktop
   ```

   The policy uses only `deny` and `add-headers`, which the free plan allows. `url-rewrite` and `remove-headers` need a paid plan (ngrok refuses to start with `ERR_NGROK_2263`). That's why the secret goes in a query parameter, not the path, and why the policy rejects requests that bring their own identity headers instead of stripping them.

4. Start the tunnel:

   ```bash
   ngrok http 3000 --url https://integral-virtually-pegasus.ngrok-free.app --traffic-policy-file demo/.runtime/townhall-tunnel.yml
   ```

5. Check it before adding it to Claude. The first call should print `404`. The second should list the five tools:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://integral-virtually-pegasus.ngrok-free.app/api/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```

   ```bash
   curl -s -X POST 'https://integral-virtually-pegasus.ngrok-free.app/api/mcp?key=<SECRET>' -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```

6. In Claude, go to Settings → Connectors → Add custom connector. Name it "Town Hall", use the URL `https://integral-virtually-pegasus.ngrok-free.app/api/mcp?key=<SECRET>`, and pick no sign-in. Runs then show up on the Audit page as `maria` / `claude-desktop`.

**Notes:**

- One policy is one identity. For a second persona, run a second tunnel with its own policy and secret.
- Treat the URL as a password: anyone who has it acts as the injected user. Stop ngrok after filming, and make a new secret if the URL leaks.
- Verified through a live free-plan tunnel (random URL, not a static domain):
  - No key, a wrong key, another path and a request bringing its own `X-Townhall-User` all get 404.
  - `initialize`, `tools/list` and a `run_tool` with the key all work, including with a browser user agent. The free-plan warning page did not get in the way.
  - The run's audit row shows `maria` / `claude-desktop`.
- Not verified: the Claude connector itself, including whether Claude keeps the `?key=` query string on every request. If step 5 passes but the connector fails, check that first.

