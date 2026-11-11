#!/usr/bin/env bash
# Builds the product tour (src/app/tour) as a static site for GitHub Pages into ./pages-out.
# The tour is a client-side mock, so it needs no backend. The real app (MCP, database, runner)
# can't be exported statically, so we build a copy with a minimal app shell instead.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE_PATH="${PAGES_BASE_PATH:-/townhall}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

rsync -a --exclude node_modules --exclude .next --exclude .git --exclude pages-out --exclude demo/.runtime ./ "$WORK/"
cd "$WORK"
npm ci --no-audit --no-fund --prefer-offline

# Keep only what the tour imports; the rest needs the backend.
rm -rf tests scripts tools demo docs *.mts vitest.config.* 
find src -type f ! -path "src/components/product-tour.tsx" ! -path "src/components/ui/*" ! -path "src/lib/utils.ts" -delete
find src -type d -empty -delete
mkdir -p src/app
cp "$OLDPWD/src/app/globals.css" "$OLDPWD/src/app/favicon.ico" src/app/

cat > src/app/layout.tsx <<'TSX'
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Landmark } from "lucide-react";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tour · Town Hall",
  description: "A cloud for small software. A scripted tour of Town Hall.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 font-semibold">
            <Landmark className="size-5" />
            Town Hall
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
TSX

cat > src/app/page.tsx <<'TSX'
import { ProductTour } from "@/components/product-tour";

export default function Page() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Tour</h1>
        <p className="text-sm text-muted-foreground">
          Share a tool, let a colleague&apos;s agent use it, and watch the creator&apos;s agent ship the field it was missing. Scripted, about 25 seconds.
        </p>
      </div>
      <ProductTour />
    </div>
  );
}
TSX

cat > next.config.ts <<TS
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "${BASE_PATH}",
  images: { unoptimized: true },
  turbopack: { rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } },
};

export default nextConfig;
TS

npx next build
touch out/.nojekyll
rm -rf "$OLDPWD/pages-out"
cp -R out "$OLDPWD/pages-out"
