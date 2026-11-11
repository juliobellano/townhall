import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const fmt = (v: unknown) => (typeof v === "number" ? v.toLocaleString("en-US") : typeof v === "string" ? v : JSON.stringify(v));

/** Renders a tool result: scalar fields as a list, arrays of objects as tables, anything else as JSON. */
export function ResultView({ output }: { output: unknown }) {
  if (!isRecord(output)) return <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(output, null, 2)}</pre>;
  const scalars = Object.entries(output).filter(([, v]) => !Array.isArray(v) && !isRecord(v));
  const tables = Object.entries(output).filter(([, v]) => Array.isArray(v) && v.length > 0 && v.every(isRecord)) as [string, Record<string, unknown>[]][];
  return (
    <div className="space-y-4">
      {scalars.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          {scalars.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium">{fmt(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {tables.map(([key, rows]) => {
        const cols = Object.keys(rows[0]);
        return (
          <div key={key}>
            <p className="mb-1 text-sm text-muted-foreground">{key}</p>
            <Table>
              <TableHeader>
                <TableRow>
                  {cols.map((c) => (
                    <TableHead key={c} className={typeof rows[0][c] === "number" ? "text-right" : undefined}>
                      {c}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    {cols.map((c) => (
                      <TableCell key={c} className={typeof r[c] === "number" ? "text-right tabular-nums" : undefined}>
                        {fmt(r[c])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        );
      })}
    </div>
  );
}
