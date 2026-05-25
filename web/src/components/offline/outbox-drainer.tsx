"use client";

import { useEffect, useRef } from "react";
import { saveSceneContent } from "@/app/(app)/scenes/actions";
import { drainOutbox, outboxHasPendingItems } from "@/lib/offline/outbox";

/** Only poll when offline saves are queued; avoids idle server-action churn. */
const HEARTBEAT_MS = 120_000;

export function OutboxDrainer() {
  const runningRef = useRef(false);

  useEffect(() => {
    let stopped = false;

    async function tick() {
      if (stopped || runningRef.current) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (!(await outboxHasPendingItems())) return;
      runningRef.current = true;
      try {
        await drainOutbox(saveSceneContent);
      } catch {
        // swallow — outbox rows persist with backoff
      } finally {
        runningRef.current = false;
      }
    }

    const interval = setInterval(tick, HEARTBEAT_MS);
    const onOnline = () => {
      void tick();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);

    void tick();

    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
