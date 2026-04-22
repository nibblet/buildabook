"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateChapterFields } from "../app/(app)/chapters/actions";

type Props = {
  chapterId: string;
  initialTitle: string | null;
  placeholder: string;
  className?: string;
  /** Visual style. `heading` = h1 on chapter page; `card` = title link on corkboard card. */
  variant?: "heading" | "card";
};

export function ChapterTitleInline({
  chapterId,
  initialTitle,
  placeholder,
  className,
  variant = "heading",
}: Props) {
  const [title, setTitle] = useState<string>(initialTitle ?? "");
  const [editing, setEditing] = useState(false);
  const [, start] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTitle(initialTitle ?? "");
  }, [initialTitle]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = title.trim();
    const prev = (initialTitle ?? "").trim();
    if (next === prev) return;
    start(async () => {
      await updateChapterFields(chapterId, { title: next || null });
    });
  }

  function cancel() {
    setTitle(initialTitle ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        placeholder={placeholder}
        aria-label="Chapter title"
        className={cn(
          "w-full rounded-md border border-input bg-background px-2 py-1 outline-none ring-1 ring-ring",
          variant === "heading"
            ? "font-serif text-3xl font-semibold tracking-tight"
            : "text-sm font-medium",
          className,
        )}
      />
    );
  }

  const displayText = (initialTitle ?? "").trim() || placeholder;
  const muted = !((initialTitle ?? "").trim());

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setEditing(true);
      }}
      title="Click to rename"
      aria-label="Edit chapter title"
      className={cn(
        "group inline-flex max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-accent/50",
        variant === "heading"
          ? "font-serif text-3xl font-semibold tracking-tight"
          : "text-sm font-medium",
        muted && "text-muted-foreground italic",
        className,
      )}
    >
      <span className="truncate">{displayText}</span>
      <Pencil className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
    </button>
  );
}
