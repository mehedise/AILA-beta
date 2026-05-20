"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { FileUp, Users, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/imports", label: "Imports", icon: FileUp },
  { href: "/leads", label: "Leads", icon: Users },
];

function MountedUserButton({ size }: { size: "sm" | "md" }) {
  const [mounted, setMounted] = useState(false);
  const className = size === "md" ? "h-8 w-8" : "h-7 w-7";

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <span
        aria-hidden
        className={cn(
          "inline-block shrink-0 rounded-full bg-sidebar-accent",
          className
        )}
      />
    );
  }

  return (
    <UserButton
      appearance={{
        elements: { userButtonAvatarBox: className },
      }}
    />
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-5 text-sidebar-foreground md:flex">
        <Link href="/imports" className="block">
          <BrandMark withWordmark size={36} variant="on-dark" />
        </Link>

        <div
          className="rounded-md border border-sidebar-border/60 bg-sidebar-accent/40 p-3 text-xs leading-snug text-sidebar-foreground/80"
        >
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-brand-marigold">
            <Sparkles className="h-3 w-3" />
            AI Classification
          </div>
          Sector → Sub-industry tagged automatically with GICS 2023.
        </div>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname?.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                data-active={active ? "true" : "false"}
                className="nav-link"
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex items-center justify-between border-t border-sidebar-border/60 pt-4">
          <MountedUserButton size="md" />
          <span className="text-[11px] text-sidebar-foreground/55">
            v0.1 · beta
          </span>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border/70 bg-background/70 px-4 py-3 backdrop-blur md:hidden">
          <BrandMark withWordmark size={32} />
          <MountedUserButton size="sm" />
        </header>

        <main className={cn("flex-1 overflow-auto px-5 py-6 md:px-8 md:py-8")}>
          <div
            key={pathname}
            className={cn(
              "mx-auto w-full max-w-7xl",
              "duration-500 ease-out animate-in fade-in-0 slide-in-from-right-8",
              "motion-reduce:animate-none"
            )}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
