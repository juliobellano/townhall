## YC compiled hackathon

we are making townhall. town hall is an AI-native workflow management platform

there are 2 interfaces to use this platform (For humans and for agents)

right now, we are thinking:

next.js for humans
and MCP server to interact with the platform for agents (so that claude code, codex, or other harnesses can interact with our platformk)

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

## defending our idea

1. you might argue that, since the workflows are very easy to make, you should just let everyone's agents make their own version of the workflow.

effect: 
    - every generated "workflow" is slightly different (enterprise documents should be all the same)

2. internal tools or workflows are made to handle sensitive data that might not be able to go out of the company. (we cannot ask agents to take the data directly)
    - so, tools/workflows like this are still necessary.

## core features


