import {
  aiReadyForWritingProfile,
  askModel,
  resolveModelFromProject,
} from "@/lib/ai/model";
import {
  aiProviderForWritingProfile,
  parseWritingProfile,
} from "@/lib/deployment/writing-profile";
import { getOrCreateProject } from "@/lib/projects";
import { stripHtml } from "@/lib/html";
import { supabaseServer } from "@/lib/supabase/server";
import type { Scene } from "@/lib/supabase/types";

/** Short developmental summary of what happened across scenes in this chapter. */
export async function runChapterDebrief(
  chapterId: string,
): Promise<{ ok: boolean; text?: string; error?: string }> {
  const project = await getOrCreateProject();
  if (!project) return { ok: false, error: "No project." };

  const wp = parseWritingProfile(project.writing_profile);
  if (!aiReadyForWritingProfile(wp)) {
    return {
      ok: false,
      error:
        aiProviderForWritingProfile(wp) === "xai"
          ? "xAI API key not configured."
          : "Anthropic API key not configured.",
    };
  }

  const supabase = await supabaseServer();
  const { data: chapter } = await supabase
    .from("chapters")
    .select("title, order_index")
    .eq("id", chapterId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!chapter) return { ok: false, error: "Chapter not found." };

  const { data: scenes } = await supabase
    .from("scenes")
    .select("*")
    .eq("chapter_id", chapterId)
    .order("order_index");

  const prose = ((scenes ?? []) as Scene[])
    .map((s) => stripHtml(s.content ?? ""))
    .join("\n\n---\n\n");

  if (prose.length < 60) {
    return { ok: true, text: "Add more prose to this chapter before running a debrief." };
  }

  const chTitle =
    chapter.title?.trim() ||
    `Chapter ${(chapter.order_index ?? 0) + 1}`;

  try {
    const { text } = await askModel({
      persona: "profiler",
      system:
        "You are a developmental editor. Write two short paragraphs: (1) what shifts for the reader in this chapter emotionally and plot-wise, (2) one craft strength and one optional improvement. Plain language. No bullets.",
      user: `Chapter: ${chTitle}\n\nScene prose:\n${prose.slice(0, 14000)}`,
      model: resolveModelFromProject(project.writing_profile, "quick"),
      temperature: 0.35,
      maxTokens: 500,
      projectId: project.id,
      contextType: "chapter_debrief",
      contextId: chapterId,
      writingProfile: wp,
    });

    return { ok: true, text: text.trim() };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Debrief failed.",
    };
  }
}
