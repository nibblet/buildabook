"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { deleteChapter, updateChapterFields } from "../app/(app)/chapters/actions";

type BeatOption = { id: string; title: string };
type CharacterOption = { id: string; name: string };
type ChapterStatus = "planned" | "drafting" | "done";

export function ChapterMenu({
  chapterId,
  chapterLabel,
  pov_character_id,
  status,
  beat_ids,
  characters,
  beats,
}: {
  chapterId: string;
  chapterLabel: string;
  pov_character_id: string | null;
  status: ChapterStatus;
  beat_ids: string[];
  characters: CharacterOption[];
  beats: BeatOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function save(fields: Parameters<typeof updateChapterFields>[1]) {
    start(async () => {
      await updateChapterFields(chapterId, fields);
      router.refresh();
    });
  }

  function onDelete() {
    const ok = window.confirm(
      `Delete "${chapterLabel}" and all its scenes? This cannot be undone.`,
    );
    if (!ok) return;
    start(async () => {
      await deleteChapter(chapterId);
      router.refresh();
    });
    setOpen(false);
  }

  function toggleBeat(beatId: string) {
    const next = beat_ids.includes(beatId)
      ? beat_ids.filter((id) => id !== beatId)
      : [...beat_ids, beatId];
    save({ beat_ids: next });
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Chapter options"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
          open && "bg-accent text-foreground",
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-64 space-y-3 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              POV
            </label>
            <select
              value={pov_character_id ?? ""}
              disabled={pending}
              onChange={(e) =>
                save({ pov_character_id: e.target.value || null })
              }
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">No POV</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </label>
            <select
              value={status}
              disabled={pending}
              onChange={(e) =>
                save({ status: e.target.value as ChapterStatus })
              }
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="planned">Planned</option>
              <option value="drafting">Drafting</option>
              <option value="done">Done</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Beats
            </label>
            {beats.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No beats yet — add them on the Spine tab.
              </p>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-auto rounded-md border bg-background p-1.5">
                {beats.map((b) => {
                  const on = beat_ids.includes(b.id);
                  return (
                    <li key={b.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-xs hover:bg-accent">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={pending}
                          onChange={() => toggleBeat(b.id)}
                        />
                        <span className="truncate">{b.title}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={pending}
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete chapter
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
