## YC compiled hackathon

we are making townhall. town hall is an AI-native workflow management platform

there are 2 interfaces to use this platform (For humans and for agents)

right now, we are thinking:

next.js for humans
and MCP server to interact with the platform for agents (so that claude code, codex, or other harnesses can interact with our platform)

## YC RFS that we are trying to solve

Using agents to build personal software to solve your own problems is a lot of fun.

This is "Small Software". Purpose-built tools that will only ever have one or a small handful of users.

Small software is useful for teams too: Every team does things differently, and there's unlimited demand for bespoke tools for running workflows, tracking important numbers, managing sprints, sharing prototypes, and so on.

Software like this is now very easy to build, but still hard to deploy and share.

Incumbent clouds like Azure and AWS were designed for shipping Big Software that scales with many users… at the cost of complexity.

A cloud designed for small software could delete most of this complexity and unlock a big set of new use cases that agents have only recently made possible.

At the same time, there are other hard problems to solve: every company will want to customize the environment this software runs in, auth & permissions are hard, and allowing nontechnical users to share arbitrary code is tricky to do securely.

Small software should be as easy to share with your colleagues as a Google Doc.

If you're working on something like this, we'd love to hear from you.

## what we are trying to solve

with the current ability of agents creating very small software, it is increasingly easy to make highly custom or bespoke workflows.

e.g. hannah from marketing has her own custom workflow that she uses every day and the CEO likes it
e.g. john from engineering have his own workflow of monitoring the API connection between partners (i.e. their fields change all the time) 
e.g. sarah from finance takes data from 30 branches' database and then compile it into an excel finance report

however, sharing this "workflow" with team members or colleagues is still very complicated and not everyone understand how to run custom workflows with different packages or dependencies

e.g. not every one know what is python or go or how to even open a shell.

so, our product enables everyone's agents (executing the shared tools maybe through MCP or other necessary interfaces) to run their workflow whatever the stack is.

one-liner: everyone's agents can make internal tools, but my boss likes mine better.

## our selling point

Defenses against "just let each agent regenerate it":

1. generated versions drift, enterprise documents must be identical
2. internal workflows touch sensitive data that cannot leave the company

this is why a shared, canonical tool beats every agent making its own.

## defending our idea

1. you might argue that, since the workflows are very easy to make, you should just let everyone's agents make their own version of the workflow.

effect: 
    - every generated "workflow" is slightly different (enterprise documents should be all the same)

2. why not delegate the workflow by calling agents to handle everything end-to-end?

defense: internal tools or workflows are made to handle sensitive data that might not be able to go out of the company. (we cannot ask agents to take the data directly)
    - so, tools/workflows like this are still necessary.

## landscape

(from a /office-hours web search on 2026-11-11, generic category terms only. most sources are vendor marketing, so treat claims as directional.)

**Layer 1: what everyone knows.** There are two crowded camps.
- MCP gateways and governance: Runlayer, MintMCP, Metorial, Celigo, CData. They sit between agents and tools that already exist and add per-user identity, audit and permissions.
- "Publish your vibe-coded app behind company login": Island, TeamOnly, Netlify, Retool, and Vybe (a YC company). They assume you already have an app.

**Layer 2: current discourse.**
- Per a June 2026 forum thread reported in one source, Retool agents can consume MCP but don't expose workflows as MCP tools for external agents.
- Another source says Retool's audit logs don't cover agent tool calls.

**Layer 3: our situation.** Neither camp starts where Sarah is. She has a script on her laptop that touches 30 databases. It isn't an app and it isn't an MCP server. Our claim is that the unit is the workflow, whatever the stack, and the MCP is generated from the code. That's a real gap, but the neighbors are close, and Vybe is YC so some alums will know it.

Answer to "isn't this Vybe or Retool?": they host apps, and gateways govern tools that already exist. We take the thing on Sarah's laptop and make it callable.

Sources:
- [Celigo MCP management](https://siliconangle.com/2026/10/20/celigo-launches-mcp-tool-management-for-enterprise-ai-assistants-and-agent-access/)
- [MintMCP on gateways](https://www.mintmcp.com/blog/mcp-gateways-internal-tool-integration)
- [Retool MCP gateway discussion](https://www.stackone.com/blog/best-mcp-gateway-for-retool/)
- [Island vibe publishing](https://www.island.io/product/ai/enterprise-vibe-publishing)
- [TeamOnly MCP](https://mcpservers.org/ru/servers/sohelsd/teamonly-mcp)
- [Vybe (YC)](https://www.ycombinator.com/companies/vybe)

## core features

- AI-native workflow management
- Use your own harnesses (not locked-in like retool)
- Team members' agents can co-collaborate to improve the shared tools. (agentic collaborative improvement)
    - e.g.: my agent can use julio's agent, but I realize that there are some changes that I need in the workflow, so my agent reaches out to the workflow creator's agent and they will reason together, and improve together, and then re-deploy the tools on the spot.


## scenarios town hall can win against letting claude re-generating

- gathering data from 30 different places and all 30 of them are behind 5 different reverse proxies and locked behind vpn servers and are not documented anywhere
- peculiar throw-away or scripts testing things that are not clearly documented.
