"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
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
import { reorderChaptersInProject, reorderScenesInChapter } from "./actions";

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

  // Chapters come pre-sorted by order_index from loadSpine via SQL.
  const [chapterOrder, setChapterOrder] = useState<string[]>(() =>
    spine.chapters.map((c) => c.id),
  );
  const chapterById = useMemo(
    () => new Map(spine.chapters.map((c) => [c.id, c])),
    [spine.chapters],
  );

  const [, startChapter] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function onChapterDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = chapterOrder.indexOf(String(active.id));
    const newIndex = chapterOrder.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(chapterOrder, oldIndex, newIndex);
    setChapterOrder(next);
    startChapter(async () => {
      await reorderChaptersInProject(next);
    });
  }

  if (spine.chapters.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No chapters yet. Add one from a beat or from the Outline view.
      </p>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onChapterDragEnd}
    >
      <SortableContext
        items={chapterOrder}
        strategy={horizontalListSortingStrategy}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {chapterOrder.map((id) => {
            const chapter = chapterById.get(id);
            if (!chapter) return null;
            return (
              <ChapterCard
                key={id}
                chapter={chapter}
                beatById={beatById}
                characterById={characterById}
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
  beatById,
  characterById,
}: {
  chapter: SpineChapter;
  beatById: Map<string, SpineBeat>;
  characterById: Map<string, string>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: chapter.id });

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
  const words = chapter.scenes.reduce((s, sc) => s + (sc.wordcount ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm",
        isDragging && "opacity-70 ring-2 ring-primary",
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
          <Link
            href={`/chapters/${chapter.id}`}
            className="block truncate font-medium hover:underline"
          >
            {chapter.title ?? "Untitled chapter"}
          </Link>
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
          {chapter.scenes.length} {chapter.scenes.length === 1 ? "scene" : "scenes"} · {formatNumber(words)} w
        </span>
      </div>

      {chapter.scenes.length > 0 && (
        <ChapterScenesBoard chapter={chapter} characterById={characterById} />
      )}
    </div>
  );
}

function ChapterScenesBoard({
  chapter,
  characterById,
}: {
  chapter: SpineChapter;
  characterById: Map<string, string>;
}) {
  const [order, setOrder] = useState<string[]>(() =>
    chapter.scenes.map((s) => s.id),
  );
  const sceneById = useMemo(
    () => new Map(chapter.scenes.map((s) => [s.id, s])),
    [chapter.scenes],
  );
  const [, start] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next);
    start(async () => {
      await reorderScenesInChapter(chapter.id, next);
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1.5 border-t pt-3">
          {order.map((id) => {
            const scene = sceneById.get(id);
            if (!scene) return null;
            return (
              <SceneCard
                key={id}
                scene={scene}
                characterById={characterById}
              />
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SceneCard({
  scene,
  characterById,
}: {
  scene: Scene;
  characterById: Map<string, string>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id });

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
