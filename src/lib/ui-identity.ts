import { cookies } from "next/headers";
import { findPerson } from "./town/access";
import type { Identity } from "./town/types";

export const VIEWER_COOKIE = "townhall_user";

/**
 * Who the web UI acts as: the person picked in the header's "viewing as" switch (a cookie),
 * else TOWNHALL_UI_USER, else sarah. Mock identity for the demo: there is no login. The MCP
 * uses per-config headers instead. Only people in the directory are accepted.
 */
export async function uiIdentity(): Promise<Identity> {
  const picked = (await cookies()).get(VIEWER_COOKIE)?.value;
  const user = picked && findPerson(picked) ? picked : (process.env.TOWNHALL_UI_USER ?? "sarah");
  return { user, agent: "web-ui" };
}
