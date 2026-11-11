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

## Decisions so far

- Agents are users too. Any change to a tool updates its spec and MCP in the same change. The platform blocks a deploy where code and spec disagree.
- Agents act with the person's permissions, never more. Every action is logged with both the person and the agent.
- A human approves changes by default. Low-risk changes, like an optional field with a default, can be auto-approved if the owner opts in. A change that adds data access or permissions always gets a security review.
- Agents that read untrusted data and write code are a target. Keep the diagnosing agent separate from the one that writes the fix, with no secrets in the sandbox.
- Don't break existing agents. Prefer optional fields with defaults, and keep the old version available for a while.
- Generic customer lookup is a weak wedge (Retool and helpdesk plugins own it). The strength is the company-specific tools nobody has a safe place to put.

## Open questions

- What to call an agent's proposed change. "PR" is jargon for non-engineers. "Suggested change" is the leading option.
- When an agent finds a tool lacking a field or data type, it can propose a change and redeploy. Who presses deploy? Leaning: the agent opens the change and a preview, the owner approves, and an unresponsive owner means the agent forks into the user's own copy. This may need its own step under feature 5.
- Final name: Town Hall versus Town Square, Main Street or Commons.
- Which first customer and wedge to test with.

## Deployment: many tools, any tech stack

### Target design

- **One tool is the unit of isolation.** Never run tools from different builders in the same process or pod. They would share memory, environment variables, network access and dependency versions, which breaks the governance model.
- **Every tool becomes a standard container image.** Use the tool's own Dockerfile if it has one. Otherwise use buildpacks or a template chosen from its files (`package.json`, `requirements.txt`, `*.sh`). If neither works, an agent drafts a Dockerfile and the builder approves it. The platform never cares about the language.
- **Run each tool in a stronger sandbox than a plain container.** Use gVisor, Kata or Firecracker microVMs, which Kubernetes can use as runtime classes. Tools are written by non-experts and agents, so a shared kernel is not enough.
- **Scale to zero.** Nothing runs when nobody is calling the tool. A router holds the first request, wakes the tool and forwards it. Snapshots make waking take about a second. Owners can pin a tool as always on.
- **Share what doesn't need isolating:** base image layers, build caches, and a pool of pre-warmed sandboxes per stack. Share the warm machine pool, never a running process between tools.
- **Give each tool its own identity, secrets and outbound network rules,** limited to the connectors it was approved for.
- **Keep state in platform storage.** A sleeping tool loses its memory. Warn builders whose tools rely on local files.
- **Kubernetes is fine as the control plane** (Knative or KEDA for scale to zero), but start on a managed service such as Cloud Run or Fly Machines. Build our own fleet only when per-tool cost or startup time becomes the bottleneck.

### Hackathon MVP

The smallest version of this, on one VM with Docker and Caddy:

1. Accept a git URL or a zip.
2. Get a Dockerfile: the tool's own, a template picked by detecting its files, or one written by Claude.
3. `docker build`, then `docker run` on a free port. Tools listen on `$PORT`.
4. Add a Caddy route so `<name>.<domain>` points to that port, with automatic HTTPS.
5. Show a list of deployed tools with their links.

For the MVP, use one shared password instead of SSO, and skip scale to zero, sandboxes and rollback. Run it on a throwaway server and deploy only our own demo tools, since it runs untrusted code on one machine.

## Onboarding messy workflows

For builders who aren't technical: a pasted bash script, a list of manual steps, or requests to several websites, with no `package.json` or `pyproject.toml`. This is not covered by steps 2.1 and 4.1 as written, which assume a project with files. Update them so import accepts a script, a description or a recording.

1. **Accept anything as the starting point.** Let them paste a script, upload a file, describe the steps in words, or do the task once while an agent watches (a screen recording or browser session).
2. **Explain it back in plain language.** For example: "This pulls last week's orders from site A, looks up each customer on site B, and emails you a summary." They can't verify code, but they can verify this. Also list what the workflow touches: websites, files, logins and schedule. Get the person's explicit confirmation before going on.
3. **Fix the risky parts.**
   - Personal passwords and cookies move into the vault or a connector.
   - Local file paths move to platform storage.
   - Manual copy-paste steps become explicit inputs and outputs.
   - Websites that have an official API or connector get switched to it. The rest are kept but flagged as fragile.
4. **Prove it with a side-by-side run.** Run the original and the cleaned-up version on the same input and show both results. Non-technical people can judge an output even when they can't judge the code.
5. **Move up in stages.**
   1. It runs as-is in a locked-down sandbox, visible only to the builder.
   2. The secrets get moved.
   3. It gets a spec and an MCP so agents can call it.
   4. It's shared with the team.

   Only the last two stages need a review.

**Watch for:** scraping scripts break often, so failure alerts matter more for this group. Scripts running on someone's personal login must not be shared until that login is swapped for proper access. Run unknown scripts in a sandbox with no secrets and a restricted network.

## Where things are

- Whiteboard with the full feature tree, steps, technical approach, building blocks and risks: https://claude.ai/artifact/A5E4XN9LVDjHRkB4AD9VPr
