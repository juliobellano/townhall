"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { setViewerAction } from "@/app/actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Option = { user: string; label: string };

/** Mock login: pick who the UI acts as. Their department decides which tools they see. */
export function ViewerSwitch({ current, options }: { current: string; options: Option[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const items = Object.fromEntries(options.map((o) => [o.user, o.label]));
  return (
    <Select
      items={items}
      value={current}
      disabled={pending}
      onValueChange={(v) => {
        if (!v || v === current) return;
        start(async () => {
          await setViewerAction(v);
          router.refresh();
        });
      }}
    >
      <SelectTrigger size="sm" aria-label="Viewing as" className="min-w-44">
        <UserRound />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        {options.map((o) => (
          <SelectItem key={o.user} value={o.user}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
