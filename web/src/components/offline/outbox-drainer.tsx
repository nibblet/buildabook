"use client";

import { useEffect, useRef } from "react";
import { saveSceneContent } from "@/app/(app)/scenes/actions";
import { drainOutbox } from "@/lib/offline/outbox";

const HEARTBEAT_MS = 30_000;

export function OutboxDrainer() {
  const runningRef = useRef(false);

  useEffect(() => {
    let stopped = false;

    async function tick() {
      if (stopped || runningRef.current) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
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
    window.addEventListener("online", onOnline);

    void tick();

    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}
