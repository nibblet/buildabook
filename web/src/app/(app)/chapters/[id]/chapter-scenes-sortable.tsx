"use client";

import { useRouter } from "next/navigation";
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
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRight, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Beat, Character, Scene } from "@/lib/supabase/types";
import { cn, formatNumber } from "@/lib/utils";
import { moveSceneToChapter, reorderScenes } from "../../scenes/actions";

type ChapterOption = {
  id: string;
  title: string | null;
  order_index: number | null;
};

type Props = {
  chapterId: string;
  scenes: Scene[];
  beats: Beat[];
  characters: Character[];
  otherChapters: ChapterOption[];
};

export function ChapterScenesSortable({
  chapterId,
  scenes,
  beats,
  characters,
  otherChapters,
}: Props) {
  const beatMap = useMemo(
    () => new Map(beats.map((b) => [b.id, b])),
    [beats],
  );
  const charMap = useMemo(
    () => new Map(characters.map((c) => [c.id, c])),
    [characters],
  );

  const sortedScenes = useMemo(
    () =>
      [...scenes].sort(
        (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
      ),
    [scenes],
  );
  const ids = useMemo(() => sortedScenes.map((s) => s.id), [sortedScenes]);
  const sceneById = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes]);

  const [, start] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(ids, oldIndex, newIndex);
    start(async () => {
      await reorderScenes(chapterId, next);
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="space-y-3">
          {ids.map((id, idx) => {
            const s = sceneById.get(id);
            if (!s) return null;
            const sBeats = (s.beat_ids ?? [])
              .map((bid) => beatMap.get(bid))
              .filter(Boolean) as Beat[];
            const pov = s.pov_character_id ? charMap.get(s.pov_character_id) : null;
            return (
              <SortableSceneCard
                key={id}
                scene={s}
                idx={idx}
                sBeats={sBeats}
                pov={pov?.name ?? null}
                currentChapterId={chapterId}
                otherChapters={otherChapters}
              />
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableSceneCard({
  scene,
  idx,
  sBeats,
  pov,
  currentChapterId,
  otherChapters,
}: {
  scene: Scene;
  idx: number;
  sBeats: Beat[];
  pov: string | null;
  currentChapterId: string;
  otherChapters: ChapterOption[];
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

  return (
    <li ref={setNodeRef} style={style}>
      <Card
        className={cn(
          "transition-colors hover:border-foreground/20",
          isDragging && "opacity-70 ring-2 ring-primary",
        )}
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-start justify-between gap-3 text-base">
            <button
              type="button"
              className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
              aria-label="Reorder scene"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-5 w-5" />
            </button>
            <span className="flex-1">
              Scene {(scene.order_index ?? idx) + 1}
              {scene.title && (
                <span className="ml-2 font-normal text-muted-foreground">
                  · {scene.title}
                </span>
              )}
            </span>
            <span className="text-xs font-normal tabular-nums text-muted-foreground">
              {formatNumber(scene.wordcount ?? 0)} words
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="muted">{scene.status}</Badge>
            {pov && <span>POV: {pov}</span>}
            {sBeats.map((b) => (
              <Badge key={b.id} variant="secondary">
                {b.title}
              </Badge>
            ))}
          </div>

          {(scene.goal || scene.conflict || scene.outcome) && (
            <dl className="space-y-1 text-sm text-muted-foreground">
              {scene.goal && (
                <div>
                  <span className="font-medium text-foreground">Goal:</span>{" "}
                  {scene.goal}
                </div>
              )}
              {scene.conflict && (
                <div>
                  <span className="font-medium text-foreground">Conflict:</span>{" "}
                  {scene.conflict}
                </div>
              )}
              {scene.outcome && (
                <div>
                  <span className="font-medium text-foreground">Outcome:</span>{" "}
                  {scene.outcome}
                </div>
              )}
            </dl>
          )}

          {scene.content && <SceneSnippet html={scene.content} />}

          <SceneMoveRow
            sceneId={scene.id}
            currentChapterId={currentChapterId}
            otherChapters={otherChapters}
          />

          <div className="flex justify-end">
            <Link href={`/scenes/${scene.id}`}>
              <Button size="sm" variant="secondary" className="gap-1">
                Open scene <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function SceneMoveRow({
  sceneId,
  currentChapterId,
  otherChapters,
}: {
  sceneId: string;
  currentChapterId: string;
  otherChapters: ChapterOption[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState(otherChapters[0]?.id ?? "");
  const [, start] = useTransition();

  if (otherChapters.length === 0) return null;

  function move() {
    if (!target || target === currentChapterId) return;
    start(async () => {
      await moveSceneToChapter(sceneId, target);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs">
      <span className="text-muted-foreground">Move to chapter:</span>
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="h-8 max-w-[12rem] rounded-md border border-input bg-background px-2 text-xs"
      >
        {otherChapters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title?.trim() || `Chapter ${(c.order_index ?? 0) + 1}`}
          </option>
        ))}
      </select>
      <Button type="button" size="sm" variant="outline" className="h-8" onClick={move}>
        Move
      </Button>
    </div>
  );
}

function SceneSnippet({ html }: { html: string }) {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const snippet = text.length > 280 ? text.slice(0, 280) + "…" : text;
  return (
    <p className="rounded-md bg-muted/40 p-3 font-serif text-sm italic text-muted-foreground">
      {snippet}
    </p>
  );
}
