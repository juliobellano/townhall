import { ChangeCard } from "@/components/change-card";
import { listChanges } from "@/lib/town/changes";
import { getTool } from "@/lib/town/registry";

export const dynamic = "force-dynamic";

export default function ChangesPage() {
  const changes = listChanges(50);
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
