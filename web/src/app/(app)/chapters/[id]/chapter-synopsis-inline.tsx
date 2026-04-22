"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { updateChapterFields } from "../actions";

export function ChapterSynopsisInline({
  chapterId,
  initialSynopsis,
}: {
  chapterId: string;
  initialSynopsis: string | null;
}) {
  const [value, setValue] = useState(initialSynopsis ?? "");
  const [editing, setEditing] = useState(false);
  const [, start] = useTransition();
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setValue(initialSynopsis ?? "");
  }, [initialSynopsis]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = value.trim();
    const prev = (initialSynopsis ?? "").trim();
    if (next === prev) return;
    start(async () => {
      await updateChapterFields(chapterId, { synopsis: next || null });
    });
  }

  function cancel() {
    setValue(initialSynopsis ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <Textarea
        ref={ref}
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
        }}
        placeholder="Chapter synopsis…"
        className="max-w-prose text-sm"
      />
    );
  }

  const has = Boolean((initialSynopsis ?? "").trim());

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        "block max-w-prose rounded-md px-1 py-0.5 text-left text-sm hover:bg-accent/50",
        has ? "text-muted-foreground" : "italic text-muted-foreground/70",
      )}
    >
      {has ? initialSynopsis : "Add a short synopsis…"}
    </button>
  );
}
