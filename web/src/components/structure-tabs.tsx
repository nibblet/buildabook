"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookMarked, ListTree, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/spine", label: "Spine", icon: BookMarked },
  { href: "/outline", label: "Outline", icon: ListTree },
  { href: "/plan", label: "Corkboard", icon: LayoutGrid },
] as const;

export function StructureTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Structure views"
      className="inline-flex rounded-lg border bg-muted/40 p-1 text-sm"
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active =
          pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors",
              active
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
