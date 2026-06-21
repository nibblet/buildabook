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
import { getActiveProject } from "@/lib/projects";
import { getOrGenerateReflection } from "@/lib/ai/reflections";
import { loadSpine } from "@/lib/spine";
import { supabaseServer } from "@/lib/supabase/server";
import {
  buildCharacterLookup,
  chunkChaptersForSpineFlow,
  FLOW_SPINE_BATCH_CHAR_TARGET,
  serializeFullSpineOutline,
  serializeSpineChapterSubset,
} from "@/lib/ai/flow-outline-serialize";
import { parseJsonObject } from "@/lib/ai/continuity/parse-model-json";
import {
  optionalUuidArraySchema,
  optionalUuidSchema,
} from "@/lib/ai/flow-zod-helpers";

const ConcernItem = z.object({
  note: z.string().trim().min(1).max(600),
  related_scene_ids: optionalUuidArraySchema,
});

const TransitionItem = z.object({
  note: z.string().trim().min(1).max(600),
  from_scene_id: optionalUuidSchema,
  to_scene_id: optionalUuidSchema,
});

const SuggestionItem = z.object({
  text: z.string().trim().min(1).max(600),
  related_scene_ids: optionalUuidArraySchema,
});

export const StorySpineFlowSchema = z.object({
  summary: z.string().trim().min(1).max(520),
  sequence_concerns: z.array(ConcernItem).max(14).default([]),
  cross_chapter_transitions: z.array(TransitionItem).max(10).default([]),
  suggestions: z.array(SuggestionItem).max(12).default([]),
});

export type StorySpineFlow = z.infer<typeof StorySpineFlowSchema>;

function mergeStorySpineFlowParts(parts: StorySpineFlow[]): StorySpineFlow {
  const summary = parts
    .map((p) => p.summary.trim())
    .filter(Boolean)
    .join(" ");
  return {
    summary: summary.slice(0, 520),
    sequence_concerns: parts.flatMap((p) => p.sequence_concerns).slice(0, 22),
    cross_chapter_transitions: parts
      .flatMap((p) => p.cross_chapter_transitions)
      .slice(0, 18),
    suggestions: parts.flatMap((p) => p.suggestions).slice(0, 18),
  };
}

function parseStorySpineFlow(text: string): StorySpineFlow {
  const raw = parseJsonObject(text);
  return StorySpineFlowSchema.parse(raw);
}

const SPINE_SYSTEM = `You are a developmental editor for fiction writers. You receive ONLY outline metadata per scene (IDs, POV, beats, goal, conflict, outcome, word counts). Do NOT write story prose. Do NOT rewrite scenes.

Return STRICT JSON only (no markdown fences) with keys:
- summary: one or two sentences (max ~400 chars) on overall sequence logic and pacing across THIS outline data.
- sequence_concerns: array of objects {"note": string, "related_scene_ids": optional string UUID array}. Flag unclear causality (outcome → next goal), dropped tension, duplicate beats, POV confusion, missing escalation — reference scene_id UUIDs from the outline when possible.
- cross_chapter_transitions: array of {"note": string, "from_scene_id"?: uuid, "to_scene_id"?: uuid} for weak handoffs BETWEEN chapters if visible here.
- suggestions: array of {"text": string, "related_scene_ids"?: uuid[]} — concrete structural fixes (reorder hypotheses, bridge scenes, beat tweaks). Stay concise.

Limits: at most 10 sequence_concerns, 6 cross_chapter_transitions, 8 suggestions for this response.`;

export async function runStorySpineFlow(): Promise<{
  ok: boolean;
  result?: StorySpineFlow;
  error?: string;
}> {
  const project = await getActiveProject();
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
  const { data: chars } = await supabase
    .from("characters")
    .select("id, name")
    .eq("project_id", project.id);

  const spine = await loadSpine(project.id);
  const lookup = buildCharacterLookup(
    (chars ?? []) as { id: string; name: string }[],
  );

  const serializedFull = serializeFullSpineOutline(spine, lookup);
  const signature = createHash("sha256")
    .update(`story_spine_flow_v1:${serializedFull}`)
    .digest("hex");

  const emptyOutline =
    spine.chapters.length === 0 || spine.scenes.length === 0;
  if (emptyOutline) {
    return {
      ok: true,
      result: {
        summary:
          "Add chapters and scenes, then fill goal, conflict, and outcome on each scene card to get outline flow feedback.",
        sequence_concerns: [],
        cross_chapter_transitions: [],
        suggestions: [],
      },
    };
  }

  try {
    const body = await getOrGenerateReflection({
      projectId: project.id,
      kind: "story_spine_flow_v1",
      targetId: null,
      newSignature: signature,
      generate: async () => {
        const batches = chunkChaptersForSpineFlow(
          spine,
          lookup,
          FLOW_SPINE_BATCH_CHAR_TARGET,
        );
        const model = resolveModelFromProject(project.writing_profile, "quick");

        let totalIn = 0;
        let totalOut = 0;
        let totalCost = 0;

        const parsedParts: StorySpineFlow[] = [];

        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i]!;
          const segmentText = serializeSpineChapterSubset(spine, lookup, batch);
          const segmentLabel =
            batches.length > 1
              ? `Segment ${i + 1} of ${batches.length} (same book; incomplete alone).`
              : "";
          const user = [
            segmentLabel,
            "Outline metadata:",
            segmentText,
            "",
            "Return only JSON with keys summary, sequence_concerns, cross_chapter_transitions, suggestions.",
          ]
            .filter(Boolean)
            .join("\n");

          const { text, inputTokens, outputTokens, costUsd } = await askModel({
            persona: "reflect_flow_spine",
            system: SPINE_SYSTEM,
            user,
            model,
            temperature: 0.25,
            maxTokens: batches.length > 1 ? 750 : 950,
            projectId: project.id,
            contextType: "story_spine_flow",
            contextId: null,
            writingProfile: wp,
          });

          totalIn += inputTokens;
          totalOut += outputTokens;
          totalCost += costUsd ?? 0;

          parsedParts.push(parseStorySpineFlow(text.trim()));
        }

        const merged =
          parsedParts.length === 1
            ? parsedParts[0]!
            : mergeStorySpineFlowParts(parsedParts);

        return {
          body: JSON.stringify(merged),
          model,
          inputTokens: totalIn,
          outputTokens: totalOut,
          costUsd: totalCost,
          aiInteractionId: null,
        };
      },
    });

    const result = parseStorySpineFlow(body);
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Outline flow review failed.",
    };
  }
}
