"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  closestCenter,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber } from "@/lib/utils";
import type { Character, Scene } from "@/lib/supabase/types";
import type { SpineBeat, SpineChapter, SpineData } from "@/lib/spine";
import { NewChapterForBeatButton } from "@/components/new-chapter-button";
import { updateChapterFields } from "../chapters/actions";
import { reorderScenesInChapter } from "../plan/actions";
import { moveSceneToChapter } from "../scenes/actions";

type StatusFilter = "all" | "planned" | "drafting" | "done";
type OutlineView = "linear" | "beat";
type SceneMap = Record<string, string[]>;
const VIEW_STORAGE_KEY = "bab:outline-view";

type ChaptersForBeat = {
  beat: SpineBeat;
  chapters: SpineChapter[];
};

export function OutlineTree({
  spine,
  characters,
  targetWordcount,
  projectId,
}: {
  spine: SpineData;
  characters: Pick<Character, "id" | "name">[];
  targetWordcount: number;
  projectId: string;
}) {
  const router = useRouter();
  const [povFilter, setPovFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<OutlineView>("linear");
  const [, startTransition] = useTransition();

  useEffect(() => {
    const stored = typeof window !== "undefined"
      ? window.localStorage.getItem(VIEW_STORAGE_KEY)
      : null;
    if (stored === "linear" || stored === "beat") setView(stored);
  }, []);

  const updateView = (v: OutlineView) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {
      // ignore
    }
  };

  const characterById = useMemo(
    () => new Map(characters.map((c) => [c.id, c.name])),
    [characters],
  );

  const filterScene = useCallback(
    (s: Scene) => {
      if (povFilter !== "all" && s.pov_character_id !== povFilter) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      return true;
    },
    [povFilter, statusFilter],
  );

  const chapterById = useMemo(
    () => new Map(spine.chapters.map((c) => [c.id, c])),
    [spine.chapters],
  );

  const sceneById = useMemo(() => {
    const m = new Map<string, Scene>();
    for (const ch of spine.chapters) {
      for (const s of ch.scenes) m.set(s.id, s);
    }
    return m;
  }, [spine.chapters]);

  // Full (unfiltered) scene order per chapter — drives DnD indexing.
  const initialScenes: SceneMap = useMemo(() => {
    const out: SceneMap = {};
    for (const ch of spine.chapters) out[ch.id] = ch.scenes.map((s) => s.id);
    return out;
  }, [spine.chapters]);

  const [scenesByChapter, setScenesByChapter] = useState<SceneMap>(initialScenes);
  useEffect(() => {
    setScenesByChapter(initialScenes);
  }, [initialScenes]);

  const scenesRef = useRef(scenesByChapter);
  useEffect(() => {
    scenesRef.current = scenesByChapter;
  }, [scenesByChapter]);

  const linearByAct = useMemo(() => {
    const beatActById = new Map(spine.beats.map((b) => [b.id, b.act ?? 1]));
    const acts: Record<number, SpineChapter[]> = { 1: [], 2: [], 3: [] };
    for (const c of spine.chapters) {
      const primaryBeatId = c.beat_ids?.[0];
      const act = (primaryBeatId && beatActById.get(primaryBeatId)) || 1;
      acts[(act as 1 | 2 | 3)].push(c);
    }
    return acts;
  }, [spine.beats, spine.chapters]);

  const byAct = useMemo(() => {
    const acts: Record<number, ChaptersForBeat[]> = { 1: [], 2: [], 3: [] };
    for (const beat of spine.beats) {
      const chapters = spine.chaptersByBeat[beat.id] ?? [];
      const act = beat.act ?? 1;
      (acts[act] ||= []).push({ beat, chapters });
    }
    return acts;
  }, [spine.beats, spine.chaptersByBeat]);

  const unassignedChapters = useMemo(() => {
    const referenced = new Set<string>();
    for (const beat of spine.beats) {
      for (const c of spine.chaptersByBeat[beat.id] ?? []) {
        referenced.add(c.id);
      }
    }
    return spine.chapters.filter((c) => !referenced.has(c.id));
  }, [spine]);

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const dragType = args.active.data.current?.type as string | undefined;
    const byId = new Map(args.droppableContainers.map((c) => [c.id, c]));

    if (dragType === "scene") {
      // Prefer a scene directly under the pointer (for precise index),
      // then a chapter drop zone (append-to-chapter), then fall back to
      // rect intersection with the dragged scene.
      const pointer = pointerWithin(args);
      const sceneHit = pointer.find(
        (p) => byId.get(p.id)?.data.current?.type === "scene",
      );
      if (sceneHit) return [sceneHit];
      const chapterHit = pointer.find(
        (p) => byId.get(p.id)?.data.current?.type === "chapter-drop",
      );
      if (chapterHit) return [chapterHit];
      const rect = rectIntersection(args);
      const sceneRect = rect.find(
        (p) => byId.get(p.id)?.data.current?.type === "scene",
      );
      if (sceneRect) return [sceneRect];
      const chRect = rect.find(
        (p) => byId.get(p.id)?.data.current?.type === "chapter-drop",
      );
      return chRect ? [chRect] : [];
    }

    if (dragType === "chapter") {
      // Chapter drag (By-beat view only): retag to another beat.
      const activeData = args.active.data.current as
        | { sourceBeatId?: string }
        | undefined;
      const sourceBeatId = activeData?.sourceBeatId;
      const filtered = args.droppableContainers.filter((c) => {
        const d = c.data.current as
          | { type?: string; beatId?: string }
          | undefined;
        if (!d) return false;
        if (d.type !== "beat-drop" && d.type !== "chapter-drop") return false;
        return d.beatId !== sourceBeatId;
      });
      if (filtered.length === 0) return [];
      const scopedArgs = { ...args, droppableContainers: filtered };
      const pointer = pointerWithin(scopedArgs);
      if (pointer.length > 0) return pointer;
      const rect = rectIntersection(scopedArgs);
      if (rect.length > 0) return rect;
      return closestCenter(scopedArgs);
    }

    return closestCenter(args);
  }, []);

  function onDragStart(_event: DragStartEvent) {
    // No-op; visual state handled by useSortable / useDraggable hooks.
  }

  function onDragCancel() {
    // No-op.
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const aType = active.data.current?.type as string | undefined;
    const oType = over.data.current?.type as string | undefined;

    // --- Scene drag: reorder within / move between chapters ---
    if (aType === "scene") {
      const sceneId = String(active.id);
      const fromChapter = active.data.current?.chapterId as string | undefined;
      if (!fromChapter) return;

      let toChapter: string | undefined;
      let toIndex: number;

      if (oType === "scene") {
        toChapter = over.data.current?.chapterId as string | undefined;
        const targetList = toChapter
          ? scenesByChapter[toChapter] ?? []
          : [];
        toIndex = targetList.indexOf(String(over.id));
        if (toIndex < 0) toIndex = targetList.length;
      } else if (oType === "chapter-drop") {
        toChapter = over.data.current?.chapterId as string | undefined;
        toIndex = toChapter ? (scenesByChapter[toChapter] ?? []).length : 0;
      } else {
        return;
      }

      if (!toChapter) return;

      if (fromChapter === toChapter) {
        const list = scenesByChapter[toChapter] ?? [];
        const oldIdx = list.indexOf(sceneId);
        if (oldIdx < 0) return;
        const clamped = Math.min(Math.max(toIndex, 0), list.length - 1);
        if (oldIdx === clamped) return;
        const next = arrayMove(list, oldIdx, clamped);
        setScenesByChapter((prev) => ({ ...prev, [toChapter!]: next }));
        startTransition(async () => {
          await reorderScenesInChapter(toChapter!, next);
          router.refresh();
        });
        return;
      }

      // Cross-chapter move with explicit position.
      const srcList = (scenesByChapter[fromChapter] ?? []).filter(
        (id) => id !== sceneId,
      );
      const dstExisting = scenesByChapter[toChapter] ?? [];
      const insertAt = Math.min(Math.max(toIndex, 0), dstExisting.length);
      const dstList = [
        ...dstExisting.slice(0, insertAt),
        sceneId,
        ...dstExisting.slice(insertAt),
      ];

      setScenesByChapter((prev) => ({
        ...prev,
        [fromChapter]: srcList,
        [toChapter!]: dstList,
      }));

      startTransition(async () => {
        await moveSceneToChapter(sceneId, toChapter!);
        await Promise.all([
          reorderScenesInChapter(fromChapter, srcList),
          reorderScenesInChapter(toChapter!, dstList),
        ]);
        router.refresh();
      });
      return;
    }

    // --- Chapter drag (By-beat view): retag to another beat ---
    if (aType === "chapter") {
      const chapterId = String(active.id);
      const fromBeat = active.data.current?.sourceBeatId as string | undefined;
      const toBeat = over.data.current?.beatId as string | undefined;
      if (!toBeat || !fromBeat || toBeat === fromBeat) return;
      const chapter = chapterById.get(chapterId);
      if (!chapter) return;
      const current = chapter.beat_ids ?? [];
      const nextBeatIds = Array.from(
        new Set([...current.filter((b) => b !== fromBeat), toBeat]),
      );
      startTransition(async () => {
        await updateChapterFields(chapterId, { beat_ids: nextBeatIds });
        router.refresh();
      });
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragCancel={onDragCancel}
      onDragEnd={onDragEnd}
    >
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
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <div className="inline-flex rounded-md border bg-background p-0.5">
              {(["linear", "beat"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => updateView(v)}
                  className={cn(
                    "rounded-sm px-2 py-1 text-xs transition-colors",
                    view === v
                      ? "bg-accent font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v === "linear" ? "Linear" : "By beat"}
                </button>
              ))}
            </div>
            <span>
              {formatNumber(totalWords)} / {formatNumber(targetWordcount)} words
              {targetWordcount > 0 && <span className="ml-2">({pct}%)</span>}
            </span>
          </div>
        </div>

        {view === "linear"
          ? [1, 2, 3].map((act) => {
              const chapters = linearByAct[act] ?? [];
              if (chapters.length === 0) return null;
              return (
                <section key={act} className="space-y-2">
                  <h2 className="font-serif text-lg font-semibold">Act {act}</h2>
                  <ul className="space-y-2">
                    {chapters.map((c) => (
                      <SortableChapterBlock
                        key={c.id}
                        chapter={c}
                        sceneIds={scenesByChapter[c.id] ?? []}
                        sceneById={sceneById}
                        filterScene={filterScene}
                        collapsed={collapsed}
                        toggle={toggle}
                        characterById={characterById}
                      />
                    ))}
                  </ul>
                </section>
              );
            })
          : [1, 2, 3].map((act) => {
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
                        filterScene={filterScene}
                        projectId={projectId}
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
                <SortableChapterBlock
                  key={c.id}
                  chapter={c}
                  sceneIds={scenesByChapter[c.id] ?? []}
                  sceneById={sceneById}
                  filterScene={filterScene}
                  collapsed={collapsed}
                  toggle={toggle}
                  characterById={characterById}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    </DndContext>
  );
}

/**
 * Chapter row (Linear + Unassigned views). Scenes inside are fully sortable
 * and can be dragged to other chapters — same model as Corkboard.
 */
function SortableChapterBlock({
  chapter,
  sceneIds,
  sceneById,
  filterScene,
  collapsed,
  toggle,
  characterById,
}: {
  chapter: SpineChapter;
  sceneIds: string[];
  sceneById: Map<string, Scene>;
  filterScene: (s: Scene) => boolean;
  collapsed: Set<string>;
  toggle: (id: string) => void;
  characterById: Map<string, string>;
}) {
  return (
    <li className="rounded-md border bg-card p-3">
      <ChapterHeader
        chapter={chapter}
        collapsed={collapsed}
        toggle={toggle}
        characterById={characterById}
      />
      {!collapsed.has(`c:${chapter.id}`) && (
        <SortableSceneList
          chapterId={chapter.id}
          sceneIds={sceneIds}
          sceneById={sceneById}
          filterScene={filterScene}
          characterById={characterById}
        />
      )}
    </li>
  );
}

function BeatRow({
  beat,
  chapters,
  collapsed,
  toggle,
  characterById,
  filterScene,
  projectId,
}: {
  beat: SpineBeat;
  chapters: SpineChapter[];
  collapsed: Set<string>;
  toggle: (id: string) => void;
  characterById: Map<string, string>;
  filterScene: (s: Scene) => boolean;
  projectId: string;
}) {
  const key = `b:${beat.id}`;
  const open = !collapsed.has(key);
  const beatWords = chapters.reduce(
    (sum, c) => sum + c.scenes.reduce((s, sc) => s + (sc.wordcount ?? 0), 0),
    0,
  );
  const { setNodeRef, isOver } = useDroppable({
    id: `bz:${beat.id}`,
    data: { type: "beat-drop", beatId: beat.id },
  });
  return (
    <li
      ref={setNodeRef}
      className={cn(
        "rounded-md border bg-card",
        isOver && "ring-2 ring-primary/40",
      )}
    >
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
          <div className="flex justify-end px-3 py-2">
            <NewChapterForBeatButton
              projectId={projectId}
              beatId={beat.id}
              label="Add chapter"
              variant="ghost"
            />
          </div>
          {chapters.length === 0 ? (
            <p className="px-3 pb-3 text-xs text-muted-foreground">
              No chapters tagged to this beat yet.
            </p>
          ) : (
            <ul className="divide-y">
              {chapters.map((c) => (
                <DraggableChapterInBeat
                  key={c.id}
                  chapter={c}
                  sourceBeatId={beat.id}
                  collapsed={collapsed}
                  toggle={toggle}
                  characterById={characterById}
                  filterScene={filterScene}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * By-beat view chapter row. Draggable for beat retagging. Scenes inside are
 * plain (read-only position) because a chapter can appear under multiple
 * beats here, which breaks sortable uniqueness. Use Linear view for scene
 * reordering.
 */
function DraggableChapterInBeat({
  chapter,
  sourceBeatId,
  collapsed,
  toggle,
  characterById,
  filterScene,
}: {
  chapter: SpineChapter;
  sourceBeatId: string;
  collapsed: Set<string>;
  toggle: (id: string) => void;
  characterById: Map<string, string>;
  filterScene: (s: Scene) => boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: chapter.id,
    data: { type: "chapter", sourceBeatId },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `cz:${chapter.id}:${sourceBeatId}`,
    data: { type: "chapter-drop", chapterId: chapter.id, beatId: sourceBeatId },
  });

  const setRefs = (node: HTMLLIElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  return (
    <li
      ref={setRefs}
      style={style}
      className={cn(
        "p-3",
        isDragging && "opacity-70 ring-2 ring-primary",
        isOver && "bg-primary/5",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Move chapter to another beat"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <ChapterHeader
            chapter={chapter}
            collapsed={collapsed}
            toggle={toggle}
            characterById={characterById}
          />
          {!collapsed.has(`c:${chapter.id}`) && (
            <ReadonlySceneList
              scenes={chapter.scenes.filter(filterScene)}
              characterById={characterById}
            />
          )}
        </div>
      </div>
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

function SortableSceneList({
  chapterId,
  sceneIds,
  sceneById,
  filterScene,
  characterById,
}: {
  chapterId: string;
  sceneIds: string[];
  sceneById: Map<string, Scene>;
  filterScene: (s: Scene) => boolean;
  characterById: Map<string, string>;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `dz:${chapterId}`,
    data: { type: "chapter-drop", chapterId },
  });

  const visibleIds = sceneIds.filter((id) => {
    const s = sceneById.get(id);
    return s ? filterScene(s) : false;
  });

  return (
    <SortableContext items={sceneIds} strategy={verticalListSortingStrategy}>
      <ul
        ref={setNodeRef}
        className={cn(
          "mt-2 space-y-1",
          visibleIds.length === 0 &&
            "min-h-[36px] rounded-md border border-dashed border-muted-foreground/20 p-2 text-center text-[11px] text-muted-foreground/70",
          isOver && "bg-accent/30",
        )}
      >
        {visibleIds.length === 0 ? (
          <li className="list-none">Drop scenes here</li>
        ) : (
          visibleIds.map((id) => {
            const scene = sceneById.get(id);
            if (!scene) return null;
            return (
              <SortableSceneRow
                key={id}
                scene={scene}
                chapterId={chapterId}
                characterById={characterById}
              />
            );
          })
        )}
      </ul>
    </SortableContext>
  );
}

function SortableSceneRow({
  scene,
  chapterId,
  characterById,
}: {
  scene: Scene;
  chapterId: string;
  characterById: Map<string, string>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: scene.id,
    data: { type: "scene", chapterId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const pov = scene.pov_character_id
    ? characterById.get(scene.pov_character_id)
    : null;
  const summary =
    [scene.goal, scene.conflict, scene.outcome].filter(Boolean).join(" · ") ||
    scene.title ||
    "Untitled scene";

  return (
    <li ref={setNodeRef} style={style}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent",
          isDragging && "opacity-70 ring-2 ring-primary",
        )}
      >
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Reorder scene"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3 w-3" />
        </button>
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            scene.status === "done" && "bg-green-500",
            scene.status === "drafting" && "bg-amber-500",
            scene.status === "planned" && "bg-muted-foreground/40",
          )}
        />
        <Link
          href={`/scenes/${scene.id}`}
          className="min-w-0 flex-1 truncate text-foreground/80 hover:underline"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {summary}
        </Link>
        {pov && <span className="text-muted-foreground">{pov}</span>}
        <span className="text-muted-foreground">
          {formatNumber(scene.wordcount ?? 0)} w
        </span>
      </div>
    </li>
  );
}

/**
 * Non-sortable scene list used in the "By beat" view, where a chapter may
 * appear under multiple beats.
 */
function ReadonlySceneList({
  scenes,
  characterById,
}: {
  scenes: Scene[];
  characterById: Map<string, string>;
}) {
  if (scenes.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1">
      {scenes.map((s) => {
        const pov = s.pov_character_id
          ? characterById.get(s.pov_character_id)
          : null;
        const summary =
          [s.goal, s.conflict, s.outcome].filter(Boolean).join(" · ") ||
          s.title ||
          "Untitled scene";
        return (
          <li key={s.id}>
            <Link
              href={`/scenes/${s.id}`}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent"
            >
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  s.status === "done" && "bg-green-500",
                  s.status === "drafting" && "bg-amber-500",
                  s.status === "planned" && "bg-muted-foreground/40",
                )}
              />
              <span className="min-w-0 flex-1 truncate text-foreground/80">
                {summary}
              </span>
              {pov && <span className="text-muted-foreground">{pov}</span>}
              <span className="text-muted-foreground">
                {formatNumber(s.wordcount ?? 0)} w
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
