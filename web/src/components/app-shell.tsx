"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  Menu,
  LogOut,
  LayoutDashboard,
  Shield,
  Users,
  Globe,
  Heart,
  BookMarked,
  Settings,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { SpineData } from "@/lib/spine";
import { NovelSpine } from "@/components/novel-spine";

const WRITING_ROUTES = ["/scenes/", "/freeform"];

function getMode(pathname: string): "writing" | "planning" {
  if (WRITING_ROUTES.some((r) => pathname.startsWith(r))) return "writing";
  return "planning";
}

export function AppShell({
  spine,
  projectTitle,
  userEmail,
  isAdmin,
  children,
}: {
  spine: SpineData | null;
  projectTitle: string;
  userEmail: string;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const showSpine = !pathname.startsWith("/onboarding");
  const mode = getMode(pathname);

  // Subscribe to focus-mode body attribute set by scene pages.
  const focusMode = useSyncExternalStore(
    (cb) => {
      const obs = new MutationObserver(cb);
      obs.observe(document.body, { attributes: true, attributeFilter: ["data-focus-mode"] });
      return () => obs.disconnect();
    },
    () => document.body.getAttribute("data-focus-mode") === "true",
    () => false,
  );

  return (
    <div className="flex min-h-screen" data-mode={mode}>
      {showSpine && !focusMode && (
        <aside className="hidden w-72 shrink-0 border-r bg-muted/30 md:flex md:flex-col transition-all duration-[420ms] [transition-timing-function:cubic-bezier(0.2,0,0,1)]">
          <SidebarHeader title={projectTitle} />
          <StudioNav />
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {spine ? (
              <NovelSpine spine={spine} />
            ) : (
              <p className="p-3 text-sm text-muted-foreground">
                Set up your book to see the spine.
              </p>
            )}
          </div>
          <SidebarFooter userEmail={userEmail} isAdmin={isAdmin} />
        </aside>
      )}

      <div className="flex min-h-screen flex-1 flex-col">
        {showSpine && !focusMode && (
          <header className="flex items-center gap-2 border-b bg-background/80 px-3 py-2 backdrop-blur md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDrawerOpen((v) => !v)}
              aria-label="Toggle navigation"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full border border-primary/30">
              <Image
                src="/author-avatar.png"
                alt="Author avatar"
                fill
                sizes="28px"
                className="object-cover object-top"
                unoptimized
              />
            </div>
            <div className="truncate text-sm font-medium">{projectTitle}</div>
          </header>
        )}

        {drawerOpen && showSpine && !focusMode && (
          <div className="border-b bg-muted/50 p-3 md:hidden">
            <StudioNav className="mb-3 border-b pb-3" />
            {spine ? <NovelSpine spine={spine} /> : null}
            <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
              <span>{userEmail}</span>
              <form action="/auth/signout" method="post">
                <button className="inline-flex items-center gap-1 text-xs hover:underline">
                  <LogOut className="h-3 w-3" /> Sign out
                </button>
              </form>
            </div>
          </div>
        )}

        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function SidebarHeader({ title }: { title: string }) {
  return (
    <div className="border-b px-4 py-4">
      <Link href="/" className="group flex items-center gap-3">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-primary/30 shadow-sm transition-shadow group-hover:shadow-md">
          <Image
            src="/author-avatar.png"
            alt="Author avatar"
            fill
            sizes="40px"
            className="object-cover object-top"
            priority
            unoptimized
          />
        </div>
        <span className="truncate text-sm font-medium leading-tight group-hover:underline">
          {title}
        </span>
      </Link>
    </div>
  );
}

const STUDIO_LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/characters", label: "Characters", icon: Users },
  { href: "/world", label: "World", icon: Globe },
  { href: "/relationships", label: "Relationships", icon: Heart },
  { href: "/spine", label: "Story spine", icon: BookMarked },
  { href: "/feedback", label: "Feedback", icon: MessageSquare },
  { href: "/project/settings", label: "Settings", icon: Settings },
] as const;

function StudioNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav
      className={cn(
        "border-b px-2 py-2 text-sm md:px-3",
        className,
      )}
    >
      <ul className="grid grid-cols-2 gap-0.5">
        {STUDIO_LINKS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent",
                  active && "bg-accent font-medium text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SidebarFooter({
  userEmail,
  isAdmin,
}: {
  userEmail: string;
  isAdmin: boolean;
}) {
  return (
    <div className="border-t p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="truncate text-muted-foreground">{userEmail}</span>
        <form action="/auth/signout" method="post">
          <button
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            )}
          >
            <LogOut className="h-3 w-3" />
            Sign out
          </button>
        </form>
      </div>
      {isAdmin && (
        <Link
          href="/admin"
          className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          <Shield className="h-3 w-3" /> Admin
        </Link>
      )}
    </div>
  );
}
