"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSceneForChapter } from "../../scenes/actions";

export function AddSceneButton({ chapterId }: { chapterId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const id = await createSceneForChapter(chapterId);
          router.push(`/scenes/${id}`);
        })
      }
    >
      <Plus className="h-3 w-3" /> Add scene
    </Button>
  );
}
