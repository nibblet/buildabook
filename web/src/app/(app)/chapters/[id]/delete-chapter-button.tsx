"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteChapter } from "../actions";

export function DeleteChapterButton({
  chapterId,
  chapterTitle,
  sceneCount,
}: {
  chapterId: string;
  chapterTitle: string | null;
  sceneCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onDelete() {
    const label = chapterTitle?.trim() || "this chapter";
    const scenePhrase =
      sceneCount === 0
        ? ""
        : sceneCount === 1
          ? " and its scene"
          : ` and all ${sceneCount} scenes`;
    const confirmed = window.confirm(
      `Delete "${label}"${scenePhrase}? This removes the chapter and its scenes permanently.`,
    );
    if (!confirmed) return;

    start(async () => {
      try {
        await deleteChapter(chapterId);
        router.push("/outline");
      } catch (e) {
        console.error(e);
        window.alert(
          e instanceof Error ? e.message : "Could not delete this chapter.",
        );
      }
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="gap-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
      disabled={pending}
      onClick={onDelete}
    >
      <Trash2 className="h-3 w-3" />
      Delete chapter
    </Button>
  );
}
