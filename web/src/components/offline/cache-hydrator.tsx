"use client";

import { useEffect } from "react";
import { bulkPutEntities } from "@/lib/offline/repo";

type Entity =
  | "projects"
  | "chapters"
  | "scenes"
  | "characters"
  | "beats"
  | "world_elements"
  | "relationships"
  | "scene_revisions";

type Payload = Partial<Record<Entity, unknown[]>>;

export function CacheHydrator({ payload }: { payload: Payload }) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (cancelled) return;
        await bulkPutEntities(payload);
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[offline] hydrate failed", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payload]);
  return null;
}
