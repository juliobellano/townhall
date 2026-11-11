import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { AccessBadge } from "@/components/access-badge";
import { SchemaForm } from "@/components/schema-form";
import { ChangeCard } from "@/components/change-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listChanges } from "@/lib/town/changes";
import { getTool, getToolFor, listRuns } from "@/lib/town/registry";
import { uiIdentity } from "@/lib/ui-identity";

export const dynamic = "force-dynamic";

export default async function ToolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await uiIdentity();
  const res = getToolFor(id, me);
  if (!res.ok && res.code === "not_found") notFound();
  if (!res.ok) {
    // Restricted: show only what the catalog would, plus why. No schema, source, runs or changes.
    const t = getTool(id)!;
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{t.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <AccessBadge access={t.access} />
            <span>owner {t.owner}</span>
          </div>
        </div>
        <Alert>
          <Lock />
          <AlertTitle>You can&apos;t use this tool</AlertTitle>
          <AlertDescription>{res.error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  const tool = res.tool;
  const runs = listRuns(8, tool.id);
  const changes = listChanges(5, tool.id);
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{tool.name}</h1>
          <Badge variant="secondary">v{tool.latestVersion}</Badge>
          <span className="text-sm text-muted-foreground">owner {tool.owner}</span>
        </div>
        <p className="text-sm">{tool.description}</p>
        <div className="flex flex-wrap gap-1.5">
          <AccessBadge access={tool.access} />
          {tool.touches.map((x) => (
            <Badge key={x} variant="outline">
              {x}
            </Badge>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run</CardTitle>
          <CardDescription>The form comes from the tool&apos;s own input schema (version {tool.latestVersion}).</CardDescription>
        </CardHeader>
        <CardContent>
          <SchemaForm key={tool.latestVersion} toolId={tool.id} schema={tool.inputSchema} />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Versions</h2>
        <div className="flex flex-wrap gap-2">
          {tool.versions.map((v) => (
            <Badge key={v.version} variant={v.version === tool.latestVersion ? "default" : "outline"}>
              v{v.version}
              {v.version === tool.latestVersion ? " (latest)" : ""} · {new Date(v.createdAt).toLocaleDateString()}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Older versions stay available to agents that pin them.</p>
      </section>

      {changes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Changes</h2>
          {changes.map((c) => (
            <ChangeCard key={c.id} change={c} toolName={tool.name} />
          ))}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Recent runs</h2>
          <Link href="/audit" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            Full audit log
          </Link>
        </div>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Person</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{r.person}</TableCell>
                  <TableCell>{r.agent}</TableCell>
                  <TableCell>v{r.version}</TableCell>
                  <TableCell>
                    {r.ok ? <Badge variant="secondary">ok</Badge> : r.denied ? <Badge variant="outline">denied</Badge> : <Badge variant="destructive">failed</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
