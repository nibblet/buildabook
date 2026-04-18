"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createChapterForBeat } from "./actions";

export function StartChapterForBeat({
  projectId,
  beatId,
}: {
  projectId: string;
  beatId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      className="gap-1"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const { sceneId } = await createChapterForBeat(projectId, beatId);
          router.push(`/scenes/${sceneId}`);
        })
      }
    >
      <Plus className="h-3 w-3" /> Start a chapter for this beat
    </Button>
  );
}
