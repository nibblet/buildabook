"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Circle, CircleDot, CircleCheck } from "lucide-react";
import type { SpineData, SpineChapter } from "@/lib/spine";
import { cn } from "@/lib/utils";

type OutlineView = "linear" | "beat";
const STORAGE_KEY = "bab:outline-view";

// Read-only spine, with Linear (Act → Chapter → Scene) and By-Beat views.
export function NovelSpine({ spine }: { spine: SpineData }) {
  const [view, setView] = useState<OutlineView>("linear");

  // Hydrate from localStorage after mount to avoid SSR/client mismatch.
  useEffect(() => {
    const stored = typeof window !== "undefined"
      ? window.localStorage.getItem(STORAGE_KEY)
      : null;
    if (stored === "linear" || stored === "beat") setView(stored);
  }, []);

  const updateView = (v: OutlineView) => {
    setView(v);
    try {
      window.localStorage.setItem(STORAGE_KEY, v);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-3">
      <ViewToggle value={view} onChange={updateView} />
      {view === "linear" ? (
        <LinearView spine={spine} />
      ) : (
        <BeatView spine={spine} />
      )}
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: OutlineView;
  onChange: (v: OutlineView) => void;
}) {
  return (
    <div className="inline-flex w-full rounded-md border bg-background p-0.5 text-xs">
      {(["linear", "beat"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "flex-1 rounded-sm px-2 py-1 capitalize transition-colors",
            value === v
              ? "bg-accent font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {v === "linear" ? "Linear" : "By beat"}
        </button>
      ))}
    </div>
  );
}

function LinearView({ spine }: { spine: SpineData }) {
  const pathname = usePathname();
  const actLabels: Record<number, string> = {
    1: "Act 1 — Setup",
    2: "Act 2 — Confrontation",
    3: "Act 3 — Resolution",
  };

  // Chapter's act = act of its primary beat (first in beat_ids), default Act 1.
  const beatActById = new Map(spine.beats.map((b) => [b.id, b.act ?? 1]));
  const actGroups: Record<number, SpineChapter[]> = { 1: [], 2: [], 3: [] };
  for (const c of spine.chapters) {
    const primaryBeatId = c.beat_ids?.[0];
    const act = (primaryBeatId && beatActById.get(primaryBeatId)) || 1;
    actGroups[(act as 1 | 2 | 3)].push(c);
  }

  return (
    <div className="space-y-5 text-sm">
      {[1, 2, 3].map((act) => {
        const chapters = actGroups[act];
        if (chapters.length === 0) return null;
        return (
          <div key={act}>
            <div className="label-eyebrow mb-2 px-1">{actLabels[act]}</div>
            <ul className="space-y-0.5">
              {chapters.map((c) => {
                const chapActive = pathname === `/chapters/${c.id}`;
                return (
                  <li key={c.id}>
                    <Link
                      href={`/chapters/${c.id}`}
                      className={cn(
                        "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium hover:bg-accent",
                        chapActive && "bg-accent",
                      )}
                    >
                      <span className="truncate">
                        {c.title || `Chapter ${(c.order_index ?? 0) + 1}`}
                      </span>
                    </Link>
                    {c.scenes.length > 0 && (
                      <ul className="ml-3 mt-0.5 space-y-0.5 border-l pl-2">
                        {c.scenes.map((s, idx) => {
                          const sceneActive = pathname === `/scenes/${s.id}`;
                          return (
                            <li key={s.id}>
                              <Link
                                href={`/scenes/${s.id}`}
                                className={cn(
                                  "flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground",
                                  sceneActive &&
                                    "bg-accent text-foreground font-medium",
                                )}
                              >
                                <span className="h-1 w-1 shrink-0 rounded-full bg-current opacity-40" />
                                <span className="tabular-nums">
                                  Sc.{" "}
                                  {typeof s.order_index === "number"
                                    ? s.order_index + 1
                                    : idx + 1}
                                </span>
                                {s.title && (
                                  <span className="truncate">{s.title}</span>
                                )}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function BeatView({ spine }: { spine: SpineData }) {
  const pathname = usePathname();
  const actGroups: Record<number, typeof spine.beats> = { 1: [], 2: [], 3: [] };
  for (const b of spine.beats) {
    const act = (b.act ?? 1) as 1 | 2 | 3;
    actGroups[act].push(b);
  }
  const actLabels: Record<number, string> = {
    1: "Act 1 — Setup",
    2: "Act 2 — Confrontation",
    3: "Act 3 — Resolution",
  };

  return (
    <div className="space-y-5 text-sm">
      {[1, 2, 3].map((act) => (
        <div key={act}>
          <div className="label-eyebrow mb-2 px-1">{actLabels[act]}</div>
          <ul className="space-y-1">
            {actGroups[act].map((b) => {
              const chapters = spine.chaptersByBeat[b.id] ?? [];
              const active = pathname === `/beats/${b.id}`;
              return (
                <li key={b.id}>
                  <Link
                    href={`/beats/${b.id}`}
                    className={cn(
                      "group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent",
                      active && "bg-accent",
                    )}
                  >
                    <CoverageDot coverage={b.coverage} />
                    <span className="flex-1 leading-snug font-medium">
                      {b.title}
                    </span>
                  </Link>

                  {chapters.length > 0 && (
                    <ul className="ml-5 mt-0.5 space-y-0.5 border-l pl-2">
                      {chapters.map((c) => {
                        const chapActive = pathname === `/chapters/${c.id}`;
                        return (
                          <li key={c.id}>
                            <Link
                              href={`/chapters/${c.id}`}
                              className={cn(
                                "flex items-center gap-1 rounded px-1.5 py-1 text-xs hover:bg-accent",
                                chapActive && "bg-accent",
                              )}
                            >
                              <span className="truncate text-muted-foreground">
                                {c.title || `Chapter ${c.order_index ?? "—"}`}
                              </span>
                            </Link>

                            {c.scenes.length > 0 && (
                              <ul className="ml-3 space-y-0.5">
                                {c.scenes.map((s, idx) => {
                                  const sceneActive = pathname === `/scenes/${s.id}`;
                                  return (
                                    <li key={s.id}>
                                      <Link
                                        href={`/scenes/${s.id}`}
                                        className={cn(
                                          "flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground",
                                          sceneActive && "bg-accent text-foreground font-medium",
                                        )}
                                      >
                                        <span className="h-1 w-1 shrink-0 rounded-full bg-current opacity-40" />
                                        <span className="tabular-nums">
                                          Sc.{" "}
                                          {typeof s.order_index === "number"
                                            ? s.order_index + 1
                                            : idx + 1}
                                        </span>
                                        {s.title && (
                                          <span className="truncate">
                                            {s.title}
                                          </span>
                                        )}
                                      </Link>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function CoverageDot({
  coverage,
}: {
  coverage: "empty" | "partial" | "covered";
}) {
  if (coverage === "covered")
    return <CircleCheck className="mt-0.5 h-3.5 w-3.5 text-state-warning" />;
  if (coverage === "partial")
    return <CircleDot className="mt-0.5 h-3.5 w-3.5 text-state-warning/60" />;
  return <Circle className="mt-0.5 h-3.5 w-3.5 text-muted-foreground/40" />;
}
