import { Globe, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { accessLabel } from "@/lib/town/access";

/** Which departments may use a tool: a lock with the departments, or "Everyone". */
export function AccessBadge({ access }: { access: string[] }) {
  const open = access.length === 0;
  return (
    <Badge variant="outline" title={open ? "Every department can use this tool" : "Only these departments (and the owner) can use this tool"}>
      {open ? <Globe /> : <Lock />}
      {accessLabel(access)}
    </Badge>
  );
}
