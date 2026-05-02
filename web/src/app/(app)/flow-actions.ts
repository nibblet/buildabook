"use server";

import { revalidatePath } from "next/cache";
import { runChapterFlowWindow } from "@/lib/ai/chapter-flow-window";
import type { FlowWindowMode } from "@/lib/ai/flow-outline-serialize";
import { runStorySpineFlow } from "@/lib/ai/story-spine-flow";

export async function runStorySpineFlowAction() {
  const res = await runStorySpineFlow();
  revalidatePath("/outline");
  return res;
}

export async function runChapterFlowWindowAction(
  chapterId: string,
  opts: { mode: FlowWindowMode },
) {
  const res = await runChapterFlowWindow(chapterId, {
    mode: opts.mode,
  });
  revalidatePath(`/chapters/${chapterId}`);
  return res;
}
