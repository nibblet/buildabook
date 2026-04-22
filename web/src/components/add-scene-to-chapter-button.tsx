"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { createSceneForChapter } from "../app/(app)/scenes/actions";

export function AddSceneToChapterButton({
  chapterId,
  navigateToScene = false,
  className,
  label = "Scene",
}: {
  chapterId: string;
  navigateToScene?: boolean;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        start(async () => {
          const id = await createSceneForChapter(chapterId);
          if (navigateToScene) {
            router.push(`/scenes/${id}`);
          } else {
            router.refresh();
          }
        });
      }}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-muted-foreground/40 px-2 text-xs text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-60",
        className,
      )}
    >
      <Plus className="h-3 w-3" /> {label}
    </button>
  );
}
