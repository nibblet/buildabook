"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CloudOff, RefreshCw } from "lucide-react";
import { getDB } from "@/lib/offline/db";
import { cn } from "@/lib/utils";

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function OfflineStatus({ className }: { className?: string }) {
  const online = useOnline();
  const pending = useLiveQuery(
    () => getDB().outbox.count(),
    [],
    0,
  );

  if (online && pending === 0) return null;

  if (!online) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200",
          className,
        )}
        title="Offline — edits save locally and will sync when you reconnect."
      >
        <CloudOff className="h-3.5 w-3.5" aria-hidden />
        Offline
        {pending > 0 ? <span>· {pending} pending</span> : null}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-900 ring-1 ring-blue-200",
        className,
      )}
      title="Syncing local edits to the server."
    >
      <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
      Syncing {pending}
    </span>
  );
}
