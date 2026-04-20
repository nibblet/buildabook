"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber } from "@/lib/utils";
import type { Character, Scene } from "@/lib/supabase/types";
import type { SpineBeat, SpineChapter, SpineData } from "@/lib/spine";

type StatusFilter = "all" | "planned" | "drafting" | "done";

type ChaptersForBeat = {
  beat: SpineBeat;
  chapters: SpineChapter[];
};

export function OutlineTree({
  spine,
  characters,
  targetWordcount,
}: {
  spine: SpineData;
  characters: Pick<Character, "id" | "name">[];
  targetWordcount: number;
}) {
  const [povFilter, setPovFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const characterById = useMemo(
    () => new Map(characters.map((c) => [c.id, c.name])),
    [characters],
  );

  const filteredScene = (s: Scene) => {
    if (povFilter !== "all" && s.pov_character_id !== povFilter) return false;
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    return true;
  };

  // Group beats by act; scenes are filtered as they render.
  const byAct = useMemo(() => {
    const acts: Record<number, ChaptersForBeat[]> = { 1: [], 2: [], 3: [] };
    for (const beat of spine.beats) {
      const chapters = (spine.chaptersByBeat[beat.id] ?? []).map((c) => ({
        ...c,
        scenes: c.scenes.filter(filteredScene),
      }));
      const act = beat.act ?? 1;
      (acts[act] ||= []).push({ beat, chapters });
    }
    return acts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spine, povFilter, statusFilter]);

  // Chapters that aren't referenced under any beat (truly orphaned).
  const unassignedChapters = useMemo(() => {
    const referenced = new Set<string>();
    for (const beat of spine.beats) {
      for (const c of spine.chaptersByBeat[beat.id] ?? []) {
        referenced.add(c.id);
      }
    }
    return spine.chapters
      .filter((c) => !referenced.has(c.id))
      .map((c) => ({ ...c, scenes: c.scenes.filter(filteredScene) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spine, povFilter, statusFilter]);

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalWords = spine.totalWordcount;
  const pct = targetWordcount > 0 ? Math.round((totalWords / targetWordcount) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">POV</label>
          <select
            value={povFilter}
            onChange={(e) => setPovFilter(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-sm"
          >
            <option value="all">Any</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Status</label>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as StatusFilter)
            }
            className="rounded-md border bg-background px-2 py-1 text-sm"
          >
            <option value="all">Any</option>
            <option value="planned">Planned</option>
            <option value="drafting">Drafting</option>
            <option value="done">Done</option>
          </select>
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          {formatNumber(totalWords)} / {formatNumber(targetWordcount)} words
          {targetWordcount > 0 && <span className="ml-2">({pct}%)</span>}
        </div>
      </div>

      {[1, 2, 3].map((act) => {
        const rows = byAct[act] ?? [];
        if (rows.length === 0) return null;
        return (
          <section key={act} className="space-y-2">
            <h2 className="font-serif text-lg font-semibold">Act {act}</h2>
            <ul className="space-y-2">
              {rows.map(({ beat, chapters }) => (
                <BeatRow
                  key={beat.id}
                  beat={beat}
                  chapters={chapters}
                  collapsed={collapsed}
                  toggle={toggle}
                  characterById={characterById}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {unassignedChapters.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-serif text-lg font-semibold text-muted-foreground">
            Unassigned chapters
          </h2>
          <ul className="space-y-2">
            {unassignedChapters.map((c) => (
              <li key={c.id} className="rounded-md border bg-card p-3">
                <ChapterHeader
                  chapter={c}
                  collapsed={collapsed}
                  toggle={toggle}
                  characterById={characterById}
                />
                {!collapsed.has(`c:${c.id}`) && c.scenes.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {c.scenes.map((s) => (
                      <SceneRow
                        key={s.id}
                        scene={s}
                        characterById={characterById}
                      />
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function BeatRow({
  beat,
  chapters,
  collapsed,
  toggle,
  characterById,
}: {
  beat: SpineBeat;
  chapters: SpineChapter[];
  collapsed: Set<string>;
  toggle: (id: string) => void;
  characterById: Map<string, string>;
}) {
  const key = `b:${beat.id}`;
  const open = !collapsed.has(key);
  const beatWords = chapters.reduce(
    (sum, c) => sum + c.scenes.reduce((s, sc) => s + (sc.wordcount ?? 0), 0),
    0,
  );
  return (
    <li className="rounded-md border bg-card">
      <div className="flex w-full items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => toggle(key)}
          aria-label={open ? "Collapse beat" : "Expand beat"}
          className="shrink-0 rounded p-0.5 opacity-60 hover:bg-accent"
        >
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        <Badge
          variant="muted"
          className={cn(
            beat.coverage === "covered" && "bg-green-500/15 text-green-700 dark:text-green-300",
            beat.coverage === "partial" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
          )}
        >
          {beat.coverage}
        </Badge>
        <Link
          href={`/beats/${beat.id}`}
          className="min-w-0 flex-1 truncate font-medium hover:underline"
        >
          {beat.title}
        </Link>
        <span className="text-xs text-muted-foreground">
          {formatNumber(beatWords)} w
        </span>
      </div>
      {open && (
        <div className="border-t">
          {chapters.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No chapters tagged to this beat yet.
            </p>
          ) : (
            <ul className="divide-y">
              {chapters.map((c) => (
                <li key={c.id} className="p-3">
                  <ChapterHeader
                    chapter={c}
                    collapsed={collapsed}
                    toggle={toggle}
                    characterById={characterById}
                  />
                  {!collapsed.has(`c:${c.id}`) && c.scenes.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {c.scenes.map((s) => (
                        <SceneRow
                          key={s.id}
                          scene={s}
                          characterById={characterById}
                        />
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function ChapterHeader({
  chapter,
  collapsed,
  toggle,
  characterById,
}: {
  chapter: SpineChapter;
  collapsed: Set<string>;
  toggle: (id: string) => void;
  characterById: Map<string, string>;
}) {
  const key = `c:${chapter.id}`;
  const open = !collapsed.has(key);
  const pov = chapter.pov_character_id
    ? characterById.get(chapter.pov_character_id)
    : null;
  const words = chapter.scenes.reduce((s, sc) => s + (sc.wordcount ?? 0), 0);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => toggle(key)}
        aria-label={open ? "Collapse chapter" : "Expand chapter"}
        className="shrink-0 rounded p-0.5 opacity-60 hover:bg-accent"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </button>
      <Link
        href={`/chapters/${chapter.id}`}
        className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
      >
        {chapter.title ?? "Untitled chapter"}
      </Link>
      {pov && (
        <Badge variant="muted" className="text-xs">
          {pov}
        </Badge>
      )}
      <Badge variant="muted" className="text-xs capitalize">
        {chapter.status}
      </Badge>
      <span className="text-xs text-muted-foreground">
        {formatNumber(words)} w
      </span>
    </div>
  );
}

function SceneRow({
  scene,
  characterById,
}: {
  scene: Scene;
  characterById: Map<string, string>;
}) {
  const pov = scene.pov_character_id
    ? characterById.get(scene.pov_character_id)
    : null;
  const summary =
    [scene.goal, scene.conflict, scene.outcome].filter(Boolean).join(" · ") ||
    scene.title ||
    "Untitled scene";
  return (
    <li>
      <Link
        href={`/scenes/${scene.id}`}
        className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent"
      >
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            scene.status === "done" && "bg-green-500",
            scene.status === "drafting" && "bg-amber-500",
            scene.status === "planned" && "bg-muted-foreground/40",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-foreground/80">
          {summary}
        </span>
        {pov && <span className="text-muted-foreground">{pov}</span>}
        <span className="text-muted-foreground">
          {formatNumber(scene.wordcount ?? 0)} w
        </span>
      </Link>
    </li>
  );
}
