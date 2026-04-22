"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  closestCenter,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber } from "@/lib/utils";
import type { Character, Scene } from "@/lib/supabase/types";
import type { SpineBeat, SpineChapter, SpineData } from "@/lib/spine";
import { ChapterTitleInline } from "@/components/chapter-title-inline";
import { ChapterMenu } from "@/components/chapter-menu";
import { AddSceneToChapterButton } from "@/components/add-scene-to-chapter-button";
import { reorderChaptersInProject, reorderScenesInChapter } from "./actions";
import { moveSceneToChapter } from "../scenes/actions";

type SceneMap = Record<string, string[]>;

export function Corkboard({
  spine,
  characters,
}: {
  spine: SpineData;
  characters: Pick<Character, "id" | "name">[];
}) {
  const characterById = useMemo(
    () => new Map(characters.map((c) => [c.id, c.name])),
    [characters],
  );
  const beatById = useMemo(
    () => new Map(spine.beats.map((b) => [b.id, b])),
    [spine.beats],
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

  const initialChapterOrder = useMemo(
    () => spine.chapters.map((c) => c.id),
    [spine.chapters],
  );
  const initialScenes: SceneMap = useMemo(() => {
    const out: SceneMap = {};
    for (const ch of spine.chapters) out[ch.id] = ch.scenes.map((s) => s.id);
    return out;
  }, [spine.chapters]);

  const [chapterOrder, setChapterOrder] = useState<string[]>(initialChapterOrder);
  const [scenesByChapter, setScenesByChapter] = useState<SceneMap>(initialScenes);
  const [activeType, setActiveType] = useState<"chapter" | "scene" | null>(null);

  // Resync on server data change (e.g., router.refresh after create/delete).
  useEffect(() => {
    setChapterOrder(initialChapterOrder);
  }, [initialChapterOrder]);
  useEffect(() => {
    setScenesByChapter(initialScenes);
  }, [initialScenes]);

  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Keep latest state for async server calls.
  const scenesRef = useRef(scenesByChapter);
  useEffect(() => {
    scenesRef.current = scenesByChapter;
  }, [scenesByChapter]);

  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const dragType = args.active.data.current?.type as string | undefined;

      if (dragType === "chapter") {
        // Only allow chapter-to-chapter collisions.
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter(
            (c) => c.data.current?.type === "chapter",
          ),
        });
      }

      if (dragType === "scene") {
        // Prefer scene hits under the pointer; fall back to chapter drop zones.
        const pointer = pointerWithin(args);
        const byId = new Map(args.droppableContainers.map((c) => [c.id, c]));
        const sceneHit = pointer.find(
          (p) => byId.get(p.id)?.data.current?.type === "scene",
        );
        if (sceneHit) return [sceneHit];
        const chapterHit = pointer.find((p) => {
          const t = byId.get(p.id)?.data.current?.type;
          return t === "chapter" || t === "chapter-drop";
        });
        if (chapterHit) return [chapterHit];
        const rect = rectIntersection(args);
        const sceneRect = rect.find(
          (p) => byId.get(p.id)?.data.current?.type === "scene",
        );
        if (sceneRect) return [sceneRect];
        const chRect = rect.find((p) => {
          const t = byId.get(p.id)?.data.current?.type;
          return t === "chapter" || t === "chapter-drop";
        });
        return chRect ? [chRect] : [];
      }

      return closestCenter(args);
    },
    [],
  );

  function onDragStart(event: DragStartEvent) {
    const t = event.active.data.current?.type;
    setActiveType(t === "chapter" ? "chapter" : t === "scene" ? "scene" : null);
  }

  function onDragCancel() {
    setActiveType(null);
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveType(null);
    const { active, over } = event;
    if (!over) return;

    const aType = active.data.current?.type as string | undefined;
    const oType = over.data.current?.type as string | undefined;

    // --- Chapter reorder ---
    if (aType === "chapter" && oType === "chapter") {
      if (active.id === over.id) return;
      const oldIdx = chapterOrder.indexOf(String(active.id));
      const newIdx = chapterOrder.indexOf(String(over.id));
      if (oldIdx < 0 || newIdx < 0) return;
      const next = arrayMove(chapterOrder, oldIdx, newIdx);
      setChapterOrder(next);
      startTransition(async () => {
        await reorderChaptersInProject(next);
      });
      return;
    }

    // --- Scene drag ---
    if (aType !== "scene") return;

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
    } else if (oType === "chapter" || oType === "chapter-drop") {
      toChapter =
        oType === "chapter"
          ? String(over.id)
          : (over.data.current?.chapterId as string | undefined);
      toIndex = toChapter ? (scenesByChapter[toChapter] ?? []).length : 0;
    } else {
      return;
    }

    if (!toChapter) return;

    if (fromChapter === toChapter) {
      // Same-chapter reorder.
      const list = scenesByChapter[toChapter] ?? [];
      const oldIdx = list.indexOf(sceneId);
      if (oldIdx < 0) return;
      const clamped = Math.min(Math.max(toIndex, 0), list.length - 1);
      if (oldIdx === clamped) return;
      const next = arrayMove(list, oldIdx, clamped);
      setScenesByChapter((prev) => ({ ...prev, [toChapter!]: next }));
      startTransition(async () => {
        await reorderScenesInChapter(toChapter!, next);
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
      // Appends scene to target chapter on the server.
      await moveSceneToChapter(sceneId, toChapter!);
      // Reorder both sides to match the optimistic UI.
      await Promise.all([
        reorderScenesInChapter(fromChapter, srcList),
        reorderScenesInChapter(toChapter!, dstList),
      ]);
    });
  }

  if (spine.chapters.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No chapters yet. Use <span className="font-medium">+ New chapter</span> above to start.
      </p>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragCancel={onDragCancel}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={chapterOrder}
        strategy={horizontalListSortingStrategy}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {chapterOrder.map((id) => {
            const chapter = chapterById.get(id);
            if (!chapter) return null;
            const sceneIds = scenesByChapter[id] ?? [];
            return (
              <ChapterCard
                key={id}
                chapter={chapter}
                sceneIds={sceneIds}
                sceneById={sceneById}
                beatById={beatById}
                characterById={characterById}
                allBeats={spine.beats}
                allCharacters={characters}
                isSceneDragging={activeType === "scene"}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function ChapterCard({
  chapter,
  sceneIds,
  sceneById,
  beatById,
  characterById,
  allBeats,
  allCharacters,
  isSceneDragging,
}: {
  chapter: SpineChapter;
  sceneIds: string[];
  sceneById: Map<string, Scene>;
  beatById: Map<string, SpineBeat>;
  characterById: Map<string, string>;
  allBeats: SpineBeat[];
  allCharacters: Pick<Character, "id" | "name">[];
  isSceneDragging: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: chapter.id,
    data: { type: "chapter" },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const pov = chapter.pov_character_id
    ? characterById.get(chapter.pov_character_id)
    : null;
  const beats = (chapter.beat_ids ?? [])
    .map((id) => beatById.get(id))
    .filter(Boolean) as SpineBeat[];
  const words = sceneIds
    .map((id) => sceneById.get(id))
    .reduce((s, sc) => s + (sc?.wordcount ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm",
        isDragging && "opacity-70 ring-2 ring-primary",
        isSceneDragging && "ring-1 ring-primary/30",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Reorder chapter"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <ChapterTitleInline
              chapterId={chapter.id}
              initialTitle={chapter.title}
              placeholder={`Chapter ${(chapter.order_index ?? 0) + 1}`}
              variant="card"
              className="min-w-0 flex-1"
            />
            <Link
              href={`/chapters/${chapter.id}`}
              className="shrink-0 text-xs text-muted-foreground hover:underline"
              onPointerDown={(e) => e.stopPropagation()}
            >
              Open →
            </Link>
            <ChapterMenu
              chapterId={chapter.id}
              chapterLabel={
                chapter.title?.trim() ||
                `Chapter ${(chapter.order_index ?? 0) + 1}`
              }
              pov_character_id={chapter.pov_character_id}
              status={chapter.status}
              beat_ids={chapter.beat_ids ?? []}
              characters={allCharacters}
              beats={allBeats.map((b) => ({ id: b.id, title: b.title }))}
            />
          </div>
          {chapter.synopsis && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {chapter.synopsis}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs">
        {beats.slice(0, 3).map((b) => (
          <Badge key={b.id} variant="muted">
            {b.title}
          </Badge>
        ))}
        {beats.length > 3 && (
          <span className="text-muted-foreground">
            +{beats.length - 3} more
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {pov && <span>POV: {pov}</span>}
        <span className="capitalize">{chapter.status}</span>
        <span className="ml-auto">
          {sceneIds.length} {sceneIds.length === 1 ? "scene" : "scenes"} · {formatNumber(words)} w
        </span>
      </div>

      <ChapterScenesList
        chapterId={chapter.id}
        sceneIds={sceneIds}
        sceneById={sceneById}
        characterById={characterById}
      />

      <div className="flex justify-end">
        <AddSceneToChapterButton chapterId={chapter.id} />
      </div>
    </div>
  );
}

function ChapterScenesList({
  chapterId,
  sceneIds,
  sceneById,
  characterById,
}: {
  chapterId: string;
  sceneIds: string[];
  sceneById: Map<string, Scene>;
  characterById: Map<string, string>;
}) {
  // Droppable for empty / end-of-list targets inside this chapter.
  const { setNodeRef, isOver } = useDroppable({
    id: `dz:${chapterId}`,
    data: { type: "chapter-drop", chapterId },
  });

  return (
    <SortableContext items={sceneIds} strategy={verticalListSortingStrategy}>
      <ul
        ref={setNodeRef}
        className={cn(
          "space-y-1.5 border-t pt-3",
          sceneIds.length === 0 &&
            "min-h-[48px] rounded-md border border-dashed border-muted-foreground/20 p-2 text-center text-[11px] text-muted-foreground/70",
          isOver && "bg-accent/30",
        )}
      >
        {sceneIds.length === 0 ? (
          <li className="list-none">Drop scenes here</li>
        ) : (
          sceneIds.map((id) => {
            const scene = sceneById.get(id);
            if (!scene) return null;
            return (
              <SceneCard
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

function SceneCard({
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
          "flex items-center gap-2 rounded-md border bg-background p-2",
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
          <GripVertical className="h-3.5 w-3.5" />
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
          className="min-w-0 flex-1 truncate text-xs hover:underline"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {summary}
        </Link>
        {pov && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {pov}
          </span>
        )}
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatNumber(scene.wordcount ?? 0)} w
        </span>
      </div>
    </li>
  );
}
