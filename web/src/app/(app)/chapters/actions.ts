"use server";

import { revalidatePath } from "next/cache";
import { runChapterFactCheck } from "@/lib/ai/chapter-fact-check";
import { runChapterDebrief } from "@/lib/ai/chapter-debrief";

export async function runChapterFactCheckAction(chapterId: string) {
  const res = await runChapterFactCheck(chapterId);
  revalidatePath(`/chapters/${chapterId}`);
  return res;
}

export async function runChapterDebriefAction(chapterId: string) {
  const res = await runChapterDebrief(chapterId);
  return res;
}
