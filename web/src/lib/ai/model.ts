import type { AskOptions, AskResult } from "@/lib/ai/claude";
import { askClaude } from "@/lib/ai/claude";
import { askGrok } from "@/lib/ai/xai";
import {
  type WritingProfileId,
  aiProviderForWritingProfile,
  parseWritingProfile,
  writingProfileFromEnv,
} from "@/lib/deployment/writing-profile";
import { env } from "@/lib/env";

export type AskModelOptions = AskOptions & {
  /** Defaults to server WRITING_PROFILE when omitted */
  writingProfile?: WritingProfileId;
};

/** Routes to Anthropic or xAI based on workspace profile (`erotic_mature` → Grok). */
export async function askModel(opts: AskModelOptions): Promise<AskResult> {
  const wp = opts.writingProfile ?? writingProfileFromEnv();
  const base: AskOptions = {
    persona: opts.persona,
    system: opts.system,
    user: opts.user,
    model: opts.model,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    projectId: opts.projectId,
    contextType: opts.contextType,
    contextId: opts.contextId,
  };
  return aiProviderForWritingProfile(wp) === "xai"
    ? askGrok(base)
    : askClaude(base);
}

export function resolveModelForWritingProfile(
  wp: WritingProfileId,
  personaModel: "prose" | "quick",
): string {
  if (aiProviderForWritingProfile(wp) === "xai") {
    return personaModel === "quick"
      ? env.modelXaiQuick()
      : env.modelXaiProse();
  }
  return personaModel === "quick" ? env.modelQuick() : env.modelProse();
}

/** Whether the configured API key exists for this workspace's LLM provider. */
export function aiReadyForWritingProfile(wp: WritingProfileId): boolean {
  return aiProviderForWritingProfile(wp) === "xai"
    ? !!env.xaiApiKey()
    : !!env.anthropicApiKey();
}

/** Resolve model id when you have a project row (falls back for legacy rows). */
export function resolveModelFromProject(
  projectWritingProfile: string | null | undefined,
  personaModel: "prose" | "quick",
): string {
  return resolveModelForWritingProfile(
    parseWritingProfile(projectWritingProfile),
    personaModel,
  );
}
