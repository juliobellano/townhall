"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { findPerson } from "@/lib/town/access";
import { publishTool, runTool } from "@/lib/town/registry";
import { uiIdentity, VIEWER_COOKIE } from "@/lib/ui-identity";

export async function runToolAction(toolId: string, inputs: Record<string, unknown>, version?: number) {
  const res = await runTool({ id: toolId, inputs, version }, await uiIdentity());
  revalidatePath(`/tools/${toolId}`);
  revalidatePath("/audit");
  return res;
}

export async function publishToolAction(input: { name: string; description: string; source: string; touches: string; fixtures: string; access: string[] }) {
  let fixtures: { inputs: Record<string, unknown> }[] | undefined;
  if (input.fixtures.trim()) {
    try {
      const parsed: unknown = JSON.parse(input.fixtures);
      if (!Array.isArray(parsed) || parsed.some((f) => f === null || typeof f !== "object" || Array.isArray(f))) throw new Error("not an array of objects");
      fixtures = (parsed as Record<string, unknown>[]).map((inputs) => ({ inputs }));
    } catch {
      return { ok: false as const, code: "invalid_request" as const, error: 'Example inputs must be a JSON array of objects, for example [{"month": "2026-10"}].' };
    }
  }
  const touches = input.touches
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const res = await publishTool(
    { name: input.name, description: input.description, source: input.source, touches, access: input.access, checks: { fixtures } },
    await uiIdentity(),
  );
  revalidatePath("/");
  return res.ok ? ({ ok: true as const, id: res.tool.id }) : res;
}

/** Switches who the UI acts as (mock login). Only people in the directory; the department comes from the directory, never the client. */
export async function setViewerAction(user: string) {
  if (!findPerson(user)) return { ok: false as const, error: `Unknown person: ${user}` };
  (await cookies()).set(VIEWER_COOKIE, user, { path: "/", sameSite: "lax", httpOnly: true });
  revalidatePath("/", "layout");
  return { ok: true as const };
}
