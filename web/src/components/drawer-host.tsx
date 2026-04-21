"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

const DRAWER_KEY = "drawer";

export const DRAWER_ROUTES: Record<string, { label: string; path: string }> = {
  characters: { label: "Characters", path: "/characters" },
  world: { label: "World", path: "/world" },
  relationships: { label: "Relationships", path: "/relationships" },
  "arc-tracker": { label: "Arc tracker", path: "/arc-tracker" },
};

export function useDrawerNav() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const open = useCallback(
    (key: keyof typeof DRAWER_ROUTES) => {
      const next = new URLSearchParams(params?.toString() ?? "");
      next.set(DRAWER_KEY, String(key));
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [router, pathname, params],
  );

  const close = useCallback(() => {
    const next = new URLSearchParams(params?.toString() ?? "");
    next.delete(DRAWER_KEY);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, params]);

  return { open, close };
}

export function DrawerHost() {
  const params = useSearchParams();
  const active = params?.get(DRAWER_KEY);
  const { close } = useDrawerNav();
  const config = active ? DRAWER_ROUTES[active] : null;

  // Track mount so iframe only creates when drawer opens.
  const [wasOpened, setWasOpened] = useState(false);
  useEffect(() => {
    if (config) setWasOpened(true);
  }, [config]);

  const embedSrc = useMemo(() => {
    if (!config) return "";
    return `${config.path}?embed=1`;
  }, [config]);

  return (
    <DialogPrimitive.Root
      open={!!config}
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col border-l bg-background shadow-xl",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right",
          )}
        >
          <div className="flex items-center justify-between border-b px-4 py-2">
            <DialogPrimitive.Title className="text-sm font-medium">
              {config?.label ?? ""}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-hidden">
            {wasOpened && embedSrc ? (
              <iframe
                key={embedSrc}
                src={embedSrc}
                title={config?.label ?? "Drawer"}
                className="h-full w-full border-0"
              />
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
