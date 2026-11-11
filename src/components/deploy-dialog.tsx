"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Loader2, Upload } from "lucide-react";
import { publishToolAction } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function DeployDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", touches: "", source: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await publishToolAction(form);
      if (res.ok) {
        setOpen(false);
        setForm({ name: "", description: "", touches: "", source: "" });
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
            <Input id="name" value={form.name} onChange={set("name")} placeholder="Branch finance report" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">What it does</Label>
            <Input id="description" value={form.description} onChange={set("description")} placeholder="Monthly sales totals per branch" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="touches">What it touches (comma separated, optional)</Label>
            <Input id="touches" value={form.touches} onChange={set("touches")} placeholder="branch databases (read only)" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="source">Python source</Label>
            <Textarea id="source" value={form.source} onChange={set("source")} className="h-56 font-mono text-xs" required />
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
