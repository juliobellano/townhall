import { ChangeCard } from "@/components/change-card";
import { listChanges } from "@/lib/town/changes";
import { canAccess } from "@/lib/town/access";
import { getTool } from "@/lib/town/registry";
import { uiIdentity } from "@/lib/ui-identity";

export const dynamic = "force-dynamic";

export default async function ChangesPage() {
  const me = await uiIdentity();
  // Changes include source diffs, so only show those for tools this person may use.
  const changes = listChanges(50).filter((c) => {
    const tool = getTool(c.toolId);
    return tool !== null && canAccess(me, tool);
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Changes</h1>
        <p className="text-sm text-muted-foreground">
          When an agent needs something a tool lacks, it asks the tool&apos;s creator agent. Every request, decision, deploy-gate result, and diff is recorded here.
        </p>
      </div>
      {changes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No change requests yet.</p>
      ) : (
        <div className="space-y-4">
          {changes.map((c) => (
            <ChangeCard key={c.id} change={c} toolName={getTool(c.toolId)?.name} />
          ))}
        </div>
      )}
    </div>
  );
}
