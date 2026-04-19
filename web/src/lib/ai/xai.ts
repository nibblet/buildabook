import { env, estimateCostUsd } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";
import type { AskOptions, AskResult } from "@/lib/ai/claude";

const XAI_CHAT_URL = "https://api.x.ai/v1/chat/completions";

/** Single-turn Grok request + `ai_interactions` row (same shape as Claude). */
export async function askGrok(opts: AskOptions): Promise<AskResult> {
  const apiKey = env.xaiApiKey();
  if (!apiKey) {
    throw new Error(
      "XAI_API_KEY is not set. Add it for erotic_mature / Grok-backed deploys.",
    );
  }

  const resp = await fetch(XAI_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      stream: false,
    }),
  });

  const rawText = await resp.text();
  if (!resp.ok) {
    throw new Error(
      `xAI API ${resp.status}: ${rawText.slice(0, 600)}`,
    );
  }

  let data: {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };
  try {
    data = JSON.parse(rawText) as typeof data;
  } catch {
    throw new Error("xAI returned non-JSON response.");
  }

  const text =
    typeof data.choices?.[0]?.message?.content === "string"
      ? data.choices[0].message.content
      : "";

  const inputTokens =
    data.usage?.prompt_tokens ??
    Math.ceil((opts.system.length + opts.user.length) / 4);
  const outputTokens =
    data.usage?.completion_tokens ?? Math.ceil(text.length / 4);

  const costUsd = estimateCostUsd(opts.model, inputTokens, outputTokens);

  try {
    const supabase = await supabaseServer();
    await supabase.from("ai_interactions").insert({
      project_id: opts.projectId ?? null,
      persona: opts.persona,
      context_type: opts.contextType ?? null,
      context_id: opts.contextId ?? null,
      prompt: opts.user,
      response: text,
      model: opts.model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: Number(costUsd.toFixed(4)),
    });
  } catch (err) {
    console.error("ai_interactions log failed:", err);
  }

  return { text, inputTokens, outputTokens, model: opts.model, costUsd };
}
