import type { Identity } from "./town/types";

/** Who the web UI acts as. Single-user stub for the demo; the MCP uses per-config headers instead. */
export const uiIdentity = (): Identity => ({ user: process.env.TOWNHALL_UI_USER ?? "sarah", agent: "web-ui" });
