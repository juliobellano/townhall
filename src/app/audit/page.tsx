import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listRuns } from "@/lib/town/registry";

export const dynamic = "force-dynamic";

export default function AuditPage() {
  const runs = listRuns(100);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">Every tool run, with the person and the agent that made it. Agents act with the person&apos;s permissions, never more.</p>
      </div>
      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No runs yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Tool</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Person</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Inputs</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</TableCell>
                <TableCell>{r.toolId}</TableCell>
                <TableCell>v{r.version}</TableCell>
                <TableCell>{r.person}</TableCell>
                <TableCell>{r.agent}</TableCell>
                <TableCell className="max-w-64 truncate font-mono text-xs">{JSON.stringify(r.inputs)}</TableCell>
                <TableCell>
                  {r.ok ? <Badge variant="secondary">ok</Badge> : <Badge variant="destructive" title={r.error ?? undefined}>failed</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
