import { FileDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { RunFile } from "@/lib/town/types";

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Download links for the files a run returned, for example tax-filing.pdf. */
export function RunFiles({ files, compact = false }: { files: RunFile[]; compact?: boolean }) {
  if (files.length === 0) return compact ? <span className="text-muted-foreground">–</span> : null;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f) => (
        <a key={f.name} href={f.url} download={f.name} className={buttonVariants({ variant: compact ? "ghost" : "outline", size: "sm" })}>
          <FileDown />
          {f.name}
          {!compact && <span className="text-muted-foreground">{size(f.bytes)}</span>}
        </a>
      ))}
    </div>
  );
}
