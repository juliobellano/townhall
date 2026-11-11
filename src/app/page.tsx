import Link from "next/link";
import { Lock, Search } from "lucide-react";
import { AccessBadge } from "@/components/access-badge";
import { DeployDialog } from "@/components/deploy-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DEPARTMENT_LABELS, findPerson } from "@/lib/town/access";
import { searchTools, searchToolsFor } from "@/lib/town/registry";
import { uiIdentity } from "@/lib/ui-identity";

export const dynamic = "force-dynamic";

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const me = await uiIdentity();
  const person = findPerson(me.user);
  const tools = searchToolsFor(me, q);
  const hidden = searchTools(q).length - tools.length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tools</h1>
          <p className="text-sm text-muted-foreground">
            Shared company tools, usable by people here and by their agents over MCP. You see the tools{" "}
            {person ? `${DEPARTMENT_LABELS[person.department]}` : "your department"} may use.
          </p>
        </div>
        <DeployDialog />
      </div>

      <form className="flex max-w-md gap-2" action="/">
        <Input name="q" defaultValue={q} placeholder="Search tools, for example: tax filing" aria-label="Search tools" />
        <Button type="submit" variant="outline">
          <Search />
          Search
        </Button>
      </form>

      {tools.length === 0 ? (
        <p className="text-sm text-muted-foreground">{q ? `No tools match "${q}".` : "No tools yet. Deploy one, or publish from your agent."}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tools.map((t) => (
            <Link key={t.id} href={`/tools/${t.id}`} className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <Card className="h-full transition-colors hover:bg-muted/40">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle>{t.name}</CardTitle>
                    <Badge variant="secondary">v{t.latestVersion}</Badge>
                  </div>
                  <CardDescription>owner {t.owner}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>{t.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <AccessBadge access={t.access} />
                    {t.touches.map((x) => (
                      <Badge key={x} variant="outline">
                        {x}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      {hidden > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Lock className="size-3.5" />
          {hidden} {hidden === 1 ? "tool is" : "tools are"} restricted to other departments and not shown.
        </p>
      )}
    </div>
  );
}
