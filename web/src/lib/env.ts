import { writingProfileFromEnv } from "@/lib/deployment/writing-profile";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

// NOTE: Never use `get()` for vars needed in Client Components — dynamic
// `process.env[name]` is not inlined; use `process.env.NEXT_PUBLIC_*` literals
// (see `lib/supabase/client.ts`).

function get(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

function list(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const env = {
  supabaseUrl: () => get("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => get("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => optional("SUPABASE_SERVICE_ROLE_KEY"),

  /** Deployment slice for prompts + project rows (server-only). Defaults to pnr_dawn locally. */
  writingProfile: () => writingProfileFromEnv(),

  anthropicApiKey: () => optional("ANTHROPIC_API_KEY"),

  voyageApiKey: () => optional("VOYAGE_API_KEY"),
  voyageEmbeddingModel: () =>
    process.env.VOYAGE_EMBEDDING_MODEL || "voyage-3",
  modelProse: () =>
    process.env.ANTHROPIC_MODEL_PROSE || "claude-sonnet-4-5",
  modelQuick: () =>
    process.env.ANTHROPIC_MODEL_QUICK || "claude-haiku-4-5",

  allowedEmails: () => list("APP_ALLOWED_EMAILS"),
  adminEmails: () => list("APP_ADMIN_EMAILS"),

  appUrl: () =>
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  shareBaseUrl: () =>
    process.env.NEXT_PUBLIC_SHARE_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000",
};

// The minimum required to boot. We validate early in a non-throwing way so
// local dev without Supabase doesn't hard-crash.
export function envIsConfigured(): boolean {
  return required.every((k) => !!process.env[k]);
}

// Model-pricing table (USD per 1M tokens) — keep roughly in sync with
// Anthropic's published pricing. Used only for `ai_interactions.cost_usd`.
export const modelPricing: Record<
  string,
  { input: number; output: number }
> = {
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-haiku-4": { input: 1, output: 5 },
};

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = modelPricing[model] ?? { input: 3, output: 15 };
  return (
    (inputTokens / 1_000_000) * p.input +
    (outputTokens / 1_000_000) * p.output
  );
}
