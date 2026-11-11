"use client";

import { FileDiff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function DiffDialog({ diff, title }: { diff: string; title: string }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <FileDiff />
        View diff
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Computed by Town Hall from the old and new source, not by the agent.</DialogDescription>
        </DialogHeader>
        <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 text-xs leading-5">
          {diff.split("\n").map((line, i) => (
            <div key={i} className={line.startsWith("+") && !line.startsWith("+++") ? "bg-green-500/15" : line.startsWith("-") && !line.startsWith("---") ? "bg-red-500/15" : undefined}>
              {line || " "}
            </div>
          ))}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
