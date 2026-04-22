"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createNextChapter } from "../app/(app)/scenes/actions";
import { createChapterForBeat } from "../app/(app)/beats/[id]/actions";

type Variant = "default" | "outline" | "ghost" | "secondary";
type Size = "sm" | "default";

export function NewChapterButton({
  projectId,
  label = "New chapter",
  variant = "default",
  size = "sm",
  navigateToScene = true,
}: {
  projectId: string;
  label?: string;
  variant?: Variant;
  size?: Size;
  /** If true, navigates to the new scene; otherwise stays and router.refresh()es. */
  navigateToScene?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className="gap-1"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const { sceneId, chapterId } = await createNextChapter(projectId);
          if (navigateToScene) {
            router.push(`/chapters/${chapterId}`);
          } else {
            router.refresh();
          }
          void sceneId;
        })
      }
    >
      <Plus className="h-3.5 w-3.5" /> {label}
    </Button>
  );
}

export function NewChapterForBeatButton({
  projectId,
  beatId,
  label = "Chapter for this beat",
  variant = "outline",
  size = "sm",
}: {
  projectId: string;
  beatId: string;
  label?: string;
  variant?: Variant;
  size?: Size;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className="gap-1"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await createChapterForBeat(projectId, beatId);
          router.refresh();
        })
      }
    >
      <Plus className="h-3.5 w-3.5" /> {label}
    </Button>
  );
}
