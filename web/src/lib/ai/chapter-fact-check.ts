import {
  aiReadyForWritingProfile,
  askModel,
  resolveModelFromProject,
} from "@/lib/ai/model";
import { aiProviderForWritingProfile, parseWritingProfile } from "@/lib/deployment/writing-profile";
import type { FactCheckWarning } from "@/lib/supabase/types";
import { getOrCreateProject } from "@/lib/projects";
import { stripHtml } from "@/lib/html";
import { supabaseServer } from "@/lib/supabase/server";
import type { Character, Scene, WorldElement } from "@/lib/supabase/types";

export async function runChapterFactCheck(
  chapterId: string,
): Promise<{ ok: boolean; warnings?: FactCheckWarning[]; error?: string }> {
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
    .select("*")
    .eq("id", chapterId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!chapter) return { ok: false, error: "Chapter not found." };

  const [{ data: scenes }, { data: chars }, { data: world }] = await Promise.all([
    supabase.from("scenes").select("*").eq("chapter_id", chapterId).order("order_index"),
    supabase.from("characters").select("*").eq("project_id", project.id),
    supabase.from("world_elements").select("*").eq("project_id", project.id),
  ]);

  const prose = ((scenes ?? []) as Scene[])
    .map((s) => stripHtml(s.content ?? ""))
    .join("\n\n---\n\n");

  if (prose.length < 80) {
    await supabase
      .from("chapters")
      .update({ fact_check_warnings: [] })
      .eq("id", chapterId);
    return { ok: true, warnings: [] };
  }

  const charBlock = (chars as Character[])
    .map((c) => `- ${c.name}: wound=${c.wound ?? ""}; desire=${c.desire ?? ""}`)
    .join("\n");
  const worldBlock = (world as WorldElement[])
    .map((w) => `- ${w.name}: ${(w.description ?? "").slice(0, 200)}`)
    .join("\n");

  const user = `CHAPTER SCENES (plain text):\n${prose.slice(0, 12000)}\n\nCANON CHARACTERS:\n${charBlock}\n\nCANON WORLD:\n${worldBlock}\n\nReturn JSON only: {"warnings":[{"message":"...","severity":"warn"|"info"}]}\nList up to 6 possible continuity issues (contradictions with canon, timeline, names, powers). If none, {"warnings":[]}.`;

  try {
    const { text } = await askModel({
      persona: "profiler",
      system:
        'You are a continuity checker. Output JSON only: {"warnings":[{"message":"string","severity":"warn"|"info"}]}. No prose.',
      user,
      model: resolveModelFromProject(project.writing_profile, "quick"),
      temperature: 0.1,
      maxTokens: 600,
      projectId: project.id,
      contextType: "chapter_fact_check",
      contextId: chapterId,
      writingProfile: wp,
    });

    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned) as { warnings?: FactCheckWarning[] };
    const warnings = (parsed.warnings ?? []).slice(0, 8);

    await supabase
      .from("chapters")
      .update({ fact_check_warnings: warnings })
      .eq("id", chapterId);

    return { ok: true, warnings };
  } catch (e) {
    console.error(e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Fact check failed.",
    };
  }
}
