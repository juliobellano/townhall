import Link from "next/link";
import { GitPullRequest, Landmark, ScrollText, Wrench } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

const links = [
  { href: "/", label: "Tools", icon: Wrench },
  { href: "/changes", label: "Changes", icon: GitPullRequest },
  { href: "/audit", label: "Audit", icon: ScrollText },
];

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Landmark className="size-5" />
          Town Hall
        </Link>
        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <Icon />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
