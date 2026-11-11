"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Loader2, Upload } from "lucide-react";
import { publishToolAction } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEPARTMENT_LABELS, DEPARTMENTS, type Department } from "@/lib/town/access";

export function DeployDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", touches: "", source: "", fixtures: "" });
  const [access, setAccess] = useState<Department[]>([]);
  const toggle = (d: Department, on: boolean) => setAccess((a) => (on ? [...a, d] : a.filter((x) => x !== d)));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await publishToolAction({ ...form, access });
      if (res.ok) {
        setOpen(false);
        setForm({ name: "", description: "", touches: "", source: "", fixtures: "" });
        setAccess([]);
        router.push(`/tools/${res.id}`);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Upload />
        Deploy a tool
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Deploy a tool</DialogTitle>
          <DialogDescription>
            A tool is a Python script that reads JSON on stdin, prints a JSON result, and prints its own input schema with <code>--schema</code>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={form.name} onChange={set("name")} placeholder="Tax filing report" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">What it does</Label>
            <Input id="description" value={form.description} onChange={set("description")} placeholder="Monthly sales totals per branch" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="touches">What it touches (comma separated, optional)</Label>
            <Input id="touches" value={form.touches} onChange={set("touches")} placeholder="branch databases (read only)" />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Who can use it</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
              {DEPARTMENTS.map((d) => (
                <Label key={d} className="font-normal">
                  <Checkbox checked={access.includes(d)} onCheckedChange={(c) => toggle(d, c === true)} />
                  {DEPARTMENT_LABELS[d]}
                </Label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {access.length === 0 ? "No department picked: everyone can use it." : "Only these departments can use it, plus you as the owner."}
            </p>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="source">Python source</Label>
            <Textarea id="source" value={form.source} onChange={set("source")} className="h-56 font-mono text-xs" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fixtures">Example inputs (JSON array, recommended)</Label>
            <Textarea id="fixtures" value={form.fixtures} onChange={set("fixtures")} className="h-16 font-mono text-xs" placeholder='[{"month": "2026-10"}]' />
            <p className="text-xs text-muted-foreground">Used to check that a future change gives the same output. Without them, agent-written changes cannot be auto-deployed.</p>
          </div>
          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Upload />}
            Deploy
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
