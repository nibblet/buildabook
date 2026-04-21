import { logAiActivity } from "@/lib/ai/log";
import { supabaseServer } from "@/lib/supabase/server";
import type { Reflection } from "@/lib/supabase/types";

export type GenerateReflectionResult = {
  body: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  aiInteractionId: string | null;
};

export type RunReflectionArgs = {
  existing: Pick<Reflection, "id" | "body" | "input_signature"> | null;
  newSignature: string;
  generate: () => Promise<GenerateReflectionResult>;
};

export type RunReflectionResult = {
  hit: boolean;
  body: string;
  generated?: GenerateReflectionResult;
};

export async function runReflection(
  args: RunReflectionArgs,
): Promise<RunReflectionResult> {
  if (args.existing && args.existing.input_signature === args.newSignature) {
    return { hit: true, body: args.existing.body };
  }
  const generated = await args.generate();
  return { hit: false, body: generated.body, generated };
}

export async function getOrGenerateReflection(args: {
  projectId: string;
  kind: string;
  targetId: string | null;
  newSignature: string;
  generate: () => Promise<GenerateReflectionResult>;
}): Promise<string> {
  const supabase = await supabaseServer();

  let existingQuery = supabase
    .from("reflections")
    .select("id, body, input_signature")
    .eq("project_id", args.projectId)
    .eq("kind", args.kind);
  existingQuery = args.targetId
    ? existingQuery.eq("target_id", args.targetId)
    : existingQuery.is("target_id", null);

  const { data: existing } = await existingQuery.maybeSingle();

  const result = await runReflection({
    existing: (existing as Reflection | null) ?? null,
    newSignature: args.newSignature,
    generate: args.generate,
  });

  if (result.hit) {
    await logAiActivity({
      projectId: args.projectId,
      kind: `reflect.${args.kind}`,
      summary: `Cache hit for ${args.kind}`,
      detail: {
        target_id: args.targetId,
        hit: true,
        signature: args.newSignature.slice(0, 12),
      },
    });
    return result.body;
  }

  const g = result.generated!;

  if (existing) {
    await supabase
      .from("reflections")
      .update({
        body: g.body,
        input_signature: args.newSignature,
        model: g.model,
        input_tokens: g.inputTokens,
        output_tokens: g.outputTokens,
        cost_usd: g.costUsd,
        ai_interaction_id: g.aiInteractionId,
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("reflections").insert({
      project_id: args.projectId,
      kind: args.kind,
      target_id: args.targetId,
      body: g.body,
      input_signature: args.newSignature,
      model: g.model,
      input_tokens: g.inputTokens,
      output_tokens: g.outputTokens,
      cost_usd: g.costUsd,
      ai_interaction_id: g.aiInteractionId,
    });
  }

  await logAiActivity({
    projectId: args.projectId,
    kind: `reflect.${args.kind}`,
    summary: `Generated new ${args.kind}`,
    detail: {
      target_id: args.targetId,
      hit: false,
      signature: args.newSignature.slice(0, 12),
    },
  });

  return g.body;
}
