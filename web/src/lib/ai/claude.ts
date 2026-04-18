import Anthropic from "@anthropic-ai/sdk";
import { env, estimateCostUsd } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";
import type { PersonaKey } from "@/lib/supabase/types";

let _client: Anthropic | null = null;

function client(): Anthropic {
  if (_client) return _client;
  const apiKey = env.anthropicApiKey();
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local to use AI features.",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

export type AskOptions = {
  persona: PersonaKey;
  system: string;
  user: string;
  model: string;
  temperature: number;
  maxTokens: number;
  projectId?: string | null;
  contextType?: string | null;
  contextId?: string | null;
};

export type AskResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  costUsd: number;
};

// Single-turn request to Claude, plus a row in `ai_interactions`.
export async function askClaude(opts: AskOptions): Promise<AskResult> {
  const c = client();
  const resp = await c.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const inputTokens = resp.usage.input_tokens ?? 0;
  const outputTokens = resp.usage.output_tokens ?? 0;
  const costUsd = estimateCostUsd(opts.model, inputTokens, outputTokens);

  // Best-effort logging; never fail the call because the log didn't land.
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

export function resolveModelKey(modelKey: "prose" | "quick"): string {
  return modelKey === "quick" ? env.modelQuick() : env.modelProse();
}
