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

