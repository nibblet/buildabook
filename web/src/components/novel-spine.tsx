"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Circle, CircleDot, CircleCheck } from "lucide-react";
import type { SpineData } from "@/lib/spine";
import { cn } from "@/lib/utils";

// Read-only Act → Beat → Chapter → Scene tree. Everything clickable.
export function NovelSpine({ spine }: { spine: SpineData }) {
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
