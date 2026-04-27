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
import { ArrowRight, Loader2, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Beat, Character, Scene } from "@/lib/supabase/types";
import { cn, formatNumber } from "@/lib/utils";
import {
  deleteScene,
  moveSceneToChapter,
  reorderScenes,
  updateSceneFields,
} from "../../scenes/actions";

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
  const router = useRouter();
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [goal, setGoal] = useState(scene.goal ?? "");
  const [conflict, setConflict] = useState(scene.conflict ?? "");
  const [outcome, setOutcome] = useState(scene.outcome ?? "");
  const [isSavingMeta, startSavingMeta] = useTransition();

  function saveMetaField(
    field: "goal" | "conflict" | "outcome",
    nextValue: string,
    prevValue: string | null,
  ) {
    const next = nextValue.trim();
    const prev = (prevValue ?? "").trim();
    if (next === prev) return;
    startSavingMeta(async () => {
      await updateSceneFields(scene.id, { [field]: next || null });
    });
  }

  function onDeleteScene() {
    if (isDeleting) return;
    const confirmed = window.confirm(
      "Delete this scene? This cannot be undone and will remove all scene content.",
    );
    if (!confirmed) return;

    setIsDeleting(true);
    void (async () => {
      try {
        await deleteScene(scene.id);
        router.refresh();
      } finally {
        setIsDeleting(false);
      }
    })();
  }

  return (
    <li ref={setNodeRef} style={style}>
      <Card
        className={cn(
          "transition-colors hover:border-foreground/20",
          isDragging && "opacity-70 ring-2 ring-primary",
        )}
      >
        <CardHeader className="pb-1">
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
            <span className="flex-1 text-sm">
              <span className="font-medium">
                Scene {(scene.order_index ?? idx) + 1}
              </span>
              {scene.title && (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  · {scene.title}
                </span>
              )}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 pt-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <Badge variant="muted">{scene.status}</Badge>
            {pov && <span>POV: {pov}</span>}
            <span>·</span>
            <span className="tabular-nums">{formatNumber(scene.wordcount ?? 0)} words</span>
            {sBeats.map((b) => (
              <Badge key={b.id} variant="secondary">
                {b.title}
              </Badge>
            ))}
          </div>

          <div className="space-y-1.5">
            <LabeledInlineField
              label="Goal"
              value={goal}
              onChange={setGoal}
              onCommit={() => saveMetaField("goal", goal, scene.goal)}
            />
            <LabeledInlineField
              label="Conflict"
              value={conflict}
              onChange={setConflict}
              onCommit={() => saveMetaField("conflict", conflict, scene.conflict)}
            />
            <LabeledInlineField
              label="Outcome"
              value={outcome}
              onChange={setOutcome}
              onCommit={() => saveMetaField("outcome", outcome, scene.outcome)}
            />
          </div>

          {scene.content && <SceneSnippet html={scene.content} />}

          <SceneActionBar
            sceneId={scene.id}
            currentChapterId={currentChapterId}
            otherChapters={otherChapters}
            isDeleting={isDeleting}
            onDeleteScene={onDeleteScene}
            isSavingMeta={isSavingMeta}
          />
        </CardContent>
      </Card>
    </li>
  );
}

function LabeledInlineField({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit();
          }
        }}
        placeholder={`${label}...`}
        className="h-8 text-xs"
      />
    </label>
  );
}

function SceneActionBar({
  sceneId,
  currentChapterId,
  otherChapters,
  isDeleting,
  onDeleteScene,
  isSavingMeta,
}: {
  sceneId: string;
  currentChapterId: string;
  otherChapters: ChapterOption[];
  isDeleting: boolean;
  onDeleteScene: () => void;
  isSavingMeta: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = useState(otherChapters[0]?.id ?? "");
  const [isMoving, start] = useTransition();

  function move() {
    if (!target || target === currentChapterId) return;
    start(async () => {
      await moveSceneToChapter(sceneId, target);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
      <div className="flex items-center gap-2">
        {otherChapters.length > 0 && (
          <>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="h-8 max-w-[11rem] rounded-md border border-input bg-background px-2 text-xs"
            >
              {otherChapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title?.trim() || `Chapter ${(c.order_index ?? 0) + 1}`}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={move}
              disabled={isMoving}
            >
              Move
            </Button>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {isSavingMeta && (
          <span className="text-[11px] text-muted-foreground">Saving...</span>
        )}
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="h-8 gap-1"
          onClick={onDeleteScene}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Deleting...
            </>
          ) : (
            <>
              <Trash2 className="h-3 w-3" />
              Delete
            </>
          )}
        </Button>
        <Link href={`/scenes/${sceneId}`}>
          <Button size="sm" variant="secondary" className="h-8 gap-1">
            Open <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </div>
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
