import Link from "next/link";
import { GitPullRequest, Landmark, Play, ScrollText, Wrench } from "lucide-react";
import { ViewerSwitch } from "@/components/viewer-switch";
import { buttonVariants } from "@/components/ui/button";
import { DEPARTMENT_LABELS, DIRECTORY } from "@/lib/town/access";
import { uiIdentity } from "@/lib/ui-identity";

const links = [
  { href: "/", label: "Tools", icon: Wrench },
  { href: "/changes", label: "Changes", icon: GitPullRequest },
  { href: "/audit", label: "Audit", icon: ScrollText },
  { href: "/tour", label: "Tour", icon: Play },
];

export async function SiteHeader() {
  const me = await uiIdentity();
  const options = DIRECTORY.map((p) => ({ user: p.user, label: `${p.name} · ${DEPARTMENT_LABELS[p.department]}` }));
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Landmark className="size-5" />
          Town Hall
        </Link>
        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-1">
            {links.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                <Icon />
                <span className="max-sm:sr-only">{label}</span>
              </Link>
            ))}
          </nav>
          <ViewerSwitch current={me.user} options={options} />
        </div>
      </div>
    </header>
  );
}
