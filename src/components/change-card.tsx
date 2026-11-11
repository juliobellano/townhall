import { Bot, CircleCheck, CircleX, Clock, ShieldCheck, User } from "lucide-react";
import { DiffDialog } from "@/components/diff-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChangeRecord } from "@/lib/town/changes";

const STATUS: Record<ChangeRecord["status"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  deployed: { label: "Deployed", variant: "default" },
  rejected: { label: "Rejected by creator", variant: "secondary" },
  gate_failed: { label: "Blocked by deploy gate", variant: "destructive" },
  error: { label: "Error", variant: "destructive" },
  reviewing: { label: "Reviewing", variant: "outline" },
};

export function ChangeCard({ change, toolName }: { change: ChangeRecord; toolName?: string }) {
  const s = STATUS[change.status];
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{toolName ?? change.toolId}</CardTitle>
          <Badge variant={s.variant}>{s.label}</Badge>
          {change.toVersion && (
            <Badge variant="outline">
              v{change.fromVersion} → v{change.toVersion}
            </Badge>
          )}
          {change.cached && <Badge variant="secondary">cached decision</Badge>}
        </div>
        <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1">
            <User className="size-3.5" />
            {change.requester.user}
          </span>
          <span className="flex items-center gap-1">
            <Bot className="size-3.5" />
            {change.requester.agent}
          </span>
          <span>{new Date(change.createdAt).toLocaleString()}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <p className="text-muted-foreground">Requested</p>
          <p>{change.need}</p>
        </div>
        {change.reason && (
          <div>
            <p className="text-muted-foreground">Creator agent{change.backend ? ` (${change.backend})` : ""}</p>
            <p>{change.reason}</p>
          </div>
        )}
        {change.gate && (
          <div className="rounded-lg border p-3">
            <p className="mb-2 flex items-center gap-1.5 font-medium">
              <ShieldCheck className="size-4" />
              Deploy gate: {change.gate.pass ? "passed" : "failed"}
            </p>
            <ul className="space-y-1.5">
              {change.gate.checks.map((c) => (
                <li key={c.name} className="flex gap-2">
                  {c.pass ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-green-600" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" />}
                  <span>
                    <span className="font-medium">{c.name}.</span> <span className="text-muted-foreground">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {change.status === "reviewing" && (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="size-4" />
            Waiting for the creator agent.
          </p>
        )}
        {change.diff && <DiffDialog diff={change.diff} title={`${toolName ?? change.toolId}: v${change.fromVersion} → v${change.fromVersion + 1}`} />}
      </CardContent>
    </Card>
  );
}
