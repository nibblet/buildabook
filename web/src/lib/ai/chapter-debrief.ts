import { createHash } from "node:crypto";
import { jsonrepair } from "jsonrepair";
import { z } from "zod";
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
import { getOrGenerateReflection } from "@/lib/ai/reflections";
import { supabaseServer } from "@/lib/supabase/server";
import type { Scene } from "@/lib/supabase/types";

const ChapterDebriefSchema = z.object({
  summary: z.string().trim().min(1).max(280),
  goingWell: z.array(z.string().trim().min(1)).max(6),
  couldBeImproved: z.array(z.string().trim().min(1)).max(6),
});

export type ChapterDebrief = z.infer<typeof ChapterDebriefSchema>;

/** Short developmental summary of what happened across scenes in this chapter. */
export async function runChapterDebrief(
  chapterId: string,
): Promise<{ ok: boolean; debrief?: ChapterDebrief; error?: string }> {
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
    return {
      ok: true,
      debrief: {
        summary: "Add more prose to this chapter before running a debrief.",
        goingWell: [],
        couldBeImproved: [],
      },
    };
  }

  const chTitle =
    chapter.title?.trim() || `Chapter ${(chapter.order_index ?? 0) + 1}`;

  const signature = createHash("sha256")
    .update(`chapter_debrief_v2:${prose}`)
    .digest("hex");

  try {
    const body = await getOrGenerateReflection({
      projectId: project.id,
      kind: "chapter_debrief",
      targetId: chapterId,
      newSignature: signature,
      generate: async () => {
        const model = resolveModelFromProject(
          project.writing_profile,
          "quick",
        );
        const { text, inputTokens, outputTokens, costUsd } = await askModel({
          persona: "reflect_chapter",
          system:
            'You are a developmental editor for fiction writers. Return STRICT JSON only (no markdown, no prose outside JSON) with this shape: {"summary":"...","goingWell":["..."],"couldBeImproved":["..."]}. Rules: summary is 1-2 short sentences, max 220 chars. Each bullet should be specific, actionable, and <= 140 chars. Include 2-4 bullets per list.',
          user: `Chapter: ${chTitle}\n\nScene prose:\n${prose.slice(0, 14000)}\n\nReturn only JSON with keys: summary, goingWell, couldBeImproved.`,
          model,
          temperature: 0.25,
          maxTokens: 650,
          projectId: project.id,
          contextType: "chapter_debrief",
          contextId: chapterId,
          writingProfile: wp,
        });
        return {
          body: text.trim(),
          model,
          inputTokens,
          outputTokens,
          costUsd,
          aiInteractionId: null,
        };
      },
    });
    const parsed = parseChapterDebrief(body);
    return { ok: true, debrief: parsed };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Debrief failed.",
    };
  }
}

function parseChapterDebrief(text: string): ChapterDebrief {
  const raw = text.trim().replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Debrief did not return JSON.");
  const candidate = raw.slice(start, end + 1);
  try {
    return ChapterDebriefSchema.parse(JSON.parse(candidate));
  } catch {
    return ChapterDebriefSchema.parse(JSON.parse(jsonrepair(candidate)));
  }
}
