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
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { Beat } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { NewChapterForBeatButton } from "@/components/new-chapter-button";
import { reorderBeats, updateBeatFields } from "./actions";

export function SpineBeatList({
  beats,
  projectId,
}: {
  beats: Beat[];
  projectId: string;
}) {
  const ids = useMemo(() => beats.map((b) => b.id), [beats]);
  const beatById = useMemo(() => new Map(beats.map((b) => [b.id, b])), [beats]);

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
      await reorderBeats(next);
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
          {ids.map((id) => {
            const b = beatById.get(id);
            if (!b) return null;
            return (
              <SortableBeatCard
                key={id}
                beat={b}
                projectId={projectId}
                formKey={`${b.id}-${b.title}-${b.description ?? ""}-${b.why_it_matters ?? ""}`}
                onSave={(fields) =>
                  start(async () => {
                    await updateBeatFields(b.id, fields);
                  })
                }
              />
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableBeatCard({
  beat,
  projectId,
  formKey,
  onSave,
}: {
  beat: Beat;
  projectId: string;
  formKey: string;
  onSave: (fields: {
    title?: string;
    description?: string | null;
    why_it_matters?: string | null;
  }) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: beat.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li ref={setNodeRef} style={style}>
      <div
        className={cn(
          "rounded-lg border bg-card p-4 shadow-sm",
          isDragging && "opacity-70 ring-2 ring-primary",
        )}
      >
        <div className="flex gap-3">
          <button
            type="button"
            className="mt-1 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label="Reorder beat"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="muted">Act {beat.act ?? "—"}</Badge>
              <Link
                href={`/beats/${beat.id}`}
                className="text-xs text-muted-foreground hover:underline"
              >
                Open beat →
              </Link>
              <div className="ml-auto">
                <NewChapterForBeatButton
                  projectId={projectId}
                  beatId={beat.id}
                  label="Chapter for this beat"
                  variant="ghost"
                />
              </div>
            </div>

            <BeatInlineForm key={formKey} beat={beat} onSave={onSave} />
          </div>
        </div>
      </div>
    </li>
  );
}

function BeatInlineForm({
  beat,
  onSave,
}: {
  beat: Beat;
  onSave: (fields: {
    title?: string;
    description?: string | null;
    why_it_matters?: string | null;
  }) => void;
}) {
  const [title, setTitle] = useState(beat.title);
  const [description, setDescription] = useState(beat.description ?? "");
  const [why, setWhy] = useState(beat.why_it_matters ?? "");

  function save() {
    onSave({
      title: title.trim() || beat.title,
      description: description.trim() || null,
      why_it_matters: why.trim() || null,
    });
  }

  return (
    <div className="space-y-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={save}
        className="font-medium"
      />
      <Textarea
        rows={2}
        placeholder="Beat summary…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={save}
      />
      <Textarea
        rows={2}
        placeholder="Why this beat matters (craft note)…"
        value={why}
        onChange={(e) => setWhy(e.target.value)}
        onBlur={save}
        className="border-amber-200/60 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20"
      />
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="secondary" onClick={save}>
          Save beat
        </Button>
      </div>
    </div>
  );
}
