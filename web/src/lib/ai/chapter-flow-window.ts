import { createHash } from "node:crypto";
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
import { getOrGenerateReflection } from "@/lib/ai/reflections";
import { loadSpine } from "@/lib/spine";
import { supabaseServer } from "@/lib/supabase/server";
import {
  buildCharacterLookup,
  DEFAULT_NEIGHBOR_SCENE_COUNT,
  serializeChapterFlowWindow,
  type FlowWindowMode,
} from "@/lib/ai/flow-outline-serialize";
import { parseJsonObject } from "@/lib/ai/continuity/parse-model-json";
import { optionalUuidArraySchema } from "@/lib/ai/flow-zod-helpers";

const ConcernItem = z.object({
  note: z.string().trim().min(1).max(600),
  related_scene_ids: optionalUuidArraySchema,
});

const ReorderItem = z.object({
  note: z.string().trim().min(1).max(500),
  scene_ids: optionalUuidArraySchema,
});

export const ChapterFlowWindowSchema = z.object({
  summary: z.string().trim().min(1).max(440),
  local_concerns: z.array(ConcernItem).max(10).default([]),
  boundary_notes: z
    .array(z.string().trim().min(1).max(480))
    .max(8)
    .default([]),
  reorder_hypotheses: z.array(ReorderItem).max(6).default([]),
});

export type ChapterFlowWindow = z.infer<typeof ChapterFlowWindowSchema>;

function parseChapterFlowWindow(text: string): ChapterFlowWindow {
  const raw = parseJsonObject(text);
  return ChapterFlowWindowSchema.parse(raw);
}

const WINDOW_SYSTEM = `You are a developmental editor. Input is outline metadata only (scene cards: goal, conflict, outcome, beats, POV). Do NOT write prose.

Focus on LOCAL flow: ordering inside the focus chapter, bridges between scenes, and (if neighbor sections exist) continuity across chapter boundaries.

Return STRICT JSON only with keys:
- summary: 1–2 sentences (max ~350 chars).
- local_concerns: array of {"note": string, "related_scene_ids"?: uuid[]} referencing scene_id values from the outline.
- boundary_notes: short strings about chapter-edge handoffs (empty array if window_mode is chapter-only or no neighbors provided).
- reorder_hypotheses: array of {"note": string, "scene_ids"?: uuid[]} for possible reorder / bridge ideas. Always include reorder_hypotheses as an array (use [] if none).

related_scene_ids and scene_ids must be full canonical UUID strings copied exactly from scene_id= lines — never placeholders or labels.

Max ~8 local_concerns, ~6 boundary_notes, ~5 reorder_hypotheses.`;

export async function runChapterFlowWindow(
  chapterId: string,
  opts: {
    mode: FlowWindowMode;
    neighborSceneCount?: number;
  },
): Promise<{ ok: boolean; result?: ChapterFlowWindow; error?: string }> {
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
  const { data: chapterRow } = await supabase
    .from("chapters")
    .select("id")
    .eq("id", chapterId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!chapterRow) return { ok: false, error: "Chapter not found." };

  const { data: chars } = await supabase
    .from("characters")
    .select("id, name")
    .eq("project_id", project.id);

  const spine = await loadSpine(project.id);
  const lookup = buildCharacterLookup(
    (chars ?? []) as { id: string; name: string }[],
  );

  const n = opts.neighborSceneCount ?? DEFAULT_NEIGHBOR_SCENE_COUNT;
  const windowText = serializeChapterFlowWindow(
    spine,
    lookup,
    chapterId,
    opts.mode,
    n,
  );

  if (!windowText.trim()) {
    return { ok: false, error: "Could not build flow window for this chapter." };
  }

  const signature = createHash("sha256")
    .update(
      `chapter_flow_window_v1:mode=${opts.mode}:N=${n}:chapter=${chapterId}:${windowText}`,
    )
    .digest("hex");

  try {
    const body = await getOrGenerateReflection({
      projectId: project.id,
      kind: "chapter_flow_window_v1",
      targetId: chapterId,
      newSignature: signature,
      generate: async () => {
        const model = resolveModelFromProject(project.writing_profile, "quick");
        const { text, inputTokens, outputTokens, costUsd } = await askModel({
          persona: "reflect_flow_window",
          system: WINDOW_SYSTEM,
          user: `${windowText}\n\nReturn JSON with summary, local_concerns, boundary_notes, reorder_hypotheses.`,
          model,
          temperature: 0.25,
          maxTokens: 800,
          projectId: project.id,
          contextType: "chapter_flow_window",
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

    const result = parseChapterFlowWindow(body);
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Chapter flow review failed.",
    };
  }
}
