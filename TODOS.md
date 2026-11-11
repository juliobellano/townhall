# TODOs

## Owner opt-in for auto-deploy, human approval gate, and security-review queue

**What:** A per-tool setting for whether low-risk changes auto-deploy, an approval screen for everything else, and a review queue for any change that adds data access or permissions.

**Why:** AGENTS.md says a human approves changes by default, and a change that adds data access or permissions always gets a security review. The hackathon demo hard-wires the opt-in and the deploy gate, so a real product needs both.

**Pros:** Keeps the governance promise honest beyond the video and gives the next owner a clear starting point.

**Cons:** Real work that the demo deliberately skips.

**Context:** In `docs/designs/town-hall-demo.md`, Decision A (auto-deploy) and the three-check deploy gate (schema diff, source scan, fixture runs) are the demo versions. Productizing means a settings table, an approval page, and a review queue. The source scan is a lint, not a security control, so a real review path is needed before untrusted authors.

**Depends on / blocked by:** The demo build and the deploy gate existing.
