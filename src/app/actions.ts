"use server";

import { revalidatePath } from "next/cache";
import { publishTool, runTool } from "@/lib/town/registry";
import { uiIdentity } from "@/lib/ui-identity";

export async function runToolAction(toolId: string, inputs: Record<string, unknown>, version?: number) {
  const res = await runTool({ id: toolId, inputs, version }, uiIdentity());
  revalidatePath(`/tools/${toolId}`);
  revalidatePath("/audit");
  return res;
}

export async function publishToolAction(input: { name: string; description: string; source: string; touches: string }) {
  const touches = input.touches
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const res = await publishTool({ name: input.name, description: input.description, source: input.source, touches }, uiIdentity());
  revalidatePath("/");
  return res.ok ? ({ ok: true as const, id: res.tool.id }) : res;
}
