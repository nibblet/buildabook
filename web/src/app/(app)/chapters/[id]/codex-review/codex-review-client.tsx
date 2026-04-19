"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  acceptHighConfidenceClaimsChapterAction,
  rejectAllAutoClaimsChapterAction,
} from "@/app/(app)/chapters/[id]/codex-actions";
import type { ContinuityClaim } from "@/lib/supabase/types";

type SceneMin = { id: string; title: string | null; order_index: number | null };

export function CodexReviewClient({
  chapterId,
  chapterTitle,
  claims,
  scenes,
}: {
  chapterId: string;
  chapterTitle: string | null;
  claims: ContinuityClaim[];
  scenes: SceneMin[];
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const sceneById = useMemo(() => {
    const m = new Map<string, SceneMin>();
    for (const s of scenes) m.set(s.id, s);
    return m;
  }, [scenes]);

  const grouped = useMemo(() => {
    const m = new Map<string, ContinuityClaim[]>();
    for (const c of claims) {
      const key = c.subject_label.trim() || "—";
      const arr = m.get(key) ?? [];
      arr.push(c);
      m.set(key, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [claims]);

  function acceptHigh() {
    setMsg(null);
    start(async () => {
      const res = await acceptHighConfidenceClaimsChapterAction(chapterId);
      if (res.ok) {
        setMsg(`Promoted ${res.count ?? 0} high-confidence fact(s) to your bible.`);
        router.refresh();
      } else {
        setMsg(res.error ?? "Failed.");
      }
    });
  }

  function rejectAll() {
    if (!window.confirm("Reject all unconfirmed claims in this chapter? This cannot be undone.")) {
      return;
    }
    setMsg(null);
    start(async () => {
      const res = await rejectAllAutoClaimsChapterAction(chapterId);
      if (res.ok) {
        setMsg(`Rejected ${res.count ?? 0} claim(s).`);
        router.refresh();
      } else {
        setMsg(res.error ?? "Failed.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/chapters/${chapterId}`}>← Back to chapter</Link>
        </Button>
      </div>

      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Codex review
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {chapterTitle ?? "Untitled chapter"} — {claims.length} unconfirmed fact
          {claims.length === 1 ? "" : "s"} extracted from scene prose.
        </p>
      </div>

      {msg ? (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{msg}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={acceptHigh}>
          Accept all high-confidence
        </Button>
        <Button type="button" size="sm" variant="destructive" onClick={rejectAll}>
          Reject all (chapter)
        </Button>
      </div>

      <div className="space-y-8">
        {grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing pending. Write more scenes — facts appear here after each save.
          </p>
        ) : (
          grouped.map(([subject, rows]) => (
            <section key={subject}>
              <h2 className="mb-3 text-sm font-semibold">{subject}</h2>
              <ul className="space-y-2 text-sm">
                {rows.map((c) => {
                  const sc = sceneById.get(c.source_scene_id);
                  return (
                    <li
                      key={c.id}
                      className="rounded-md border bg-card px-3 py-2 leading-relaxed"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        {c.predicate}
                      </span>{" "}
                      → {c.object_text}
                      <span className="block text-xs text-muted-foreground">
                        {c.confidence} · scene{" "}
                        {(sc?.order_index ?? 0) + 1}
                        {sc?.title ? ` · ${sc.title}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
