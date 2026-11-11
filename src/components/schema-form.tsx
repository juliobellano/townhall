"use client";

import { useState, useTransition } from "react";
import { CircleAlert, Loader2, Play } from "lucide-react";
import { runToolAction } from "@/app/actions";
import { ResultView } from "@/components/result-view";
import { RunFiles } from "@/components/run-files";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Prop = { type?: string; description?: string; default?: unknown; enum?: string[]; items?: { type?: string }; pattern?: string };
type Schema = { properties?: Record<string, Prop>; required?: string[] };
type RunResult = Awaited<ReturnType<typeof runToolAction>>;

/** A form generated from a tool's input schema: string, enum, number, boolean, and list-of-strings fields. */
export function SchemaForm({ toolId, schema }: { toolId: string; schema: Schema }) {
  const props = Object.entries(schema.properties ?? {});
  const required = new Set(schema.required ?? []);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [result, setResult] = useState<RunResult | null>(null);
  const [pending, start] = useTransition();
  const set = (k: string, v: string | boolean) => setValues((s) => ({ ...s, [k]: v }));
  const missing = [...required].some((k) => values[k] === undefined || values[k] === "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const inputs: Record<string, unknown> = {};
    for (const [k, p] of props) {
      const raw = values[k];
      if (raw === undefined || raw === "") continue; // leave it to the tool's default
      if (p.type === "boolean") inputs[k] = raw === true;
      else if (p.type === "integer" || p.type === "number") inputs[k] = Number(raw);
      else if (p.type === "array") inputs[k] = String(raw).split(",").map((s) => s.trim()).filter(Boolean);
      else inputs[k] = raw;
    }
    start(async () => setResult(await runToolAction(toolId, inputs)));
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-4">
        {props.map(([key, p]) => {
          const hint = p.default !== undefined ? `default: ${JSON.stringify(p.default)}` : p.pattern ? `format: ${p.pattern}` : undefined;
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor={key}>{key}</Label>
                {required.has(key) ? <Badge variant="secondary">required</Badge> : <Badge variant="outline">optional</Badge>}
              </div>
              {p.type === "boolean" ? (
                <Checkbox id={key} checked={values[key] === true} onCheckedChange={(c) => set(key, c === true)} />
              ) : p.enum ? (
                <Select value={(values[key] as string) ?? ""} onValueChange={(v) => set(key, v ?? "")}>
                  <SelectTrigger id={key} className="w-64">
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {p.enum.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={key}
                  type={p.type === "integer" || p.type === "number" ? "number" : "text"}
                  className="max-w-sm"
                  placeholder={p.type === "array" ? "comma separated" : hint}
                  value={(values[key] as string) ?? ""}
                  onChange={(e) => set(key, e.target.value)}
                />
              )}
              <p className="text-xs text-muted-foreground">
                {p.description}
                {p.type === "array" && hint ? ` (${hint})` : p.type === "array" ? "" : p.description && hint ? ` (${hint})` : ""}
              </p>
            </div>
          );
        })}
        <Button type="submit" disabled={pending || missing}>
          {pending ? <Loader2 className="animate-spin" /> : <Play />}
          Run tool
        </Button>
      </form>

      {result &&
        (result.ok ? (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">v{result.version}</Badge>
              <span>finished in {result.durationMs} ms</span>
            </div>
            <RunFiles files={result.files} />
            <ResultView output={result.output} />
          </div>
        ) : (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{result.code.replace("_", " ")}</AlertTitle>
            <AlertDescription>{result.error}</AlertDescription>
          </Alert>
        ))}
    </div>
  );
}
