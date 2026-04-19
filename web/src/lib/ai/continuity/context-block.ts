import type { SupabaseClient } from "@supabase/supabase-js";
import type { Character, ContinuityClaim, WorldElement } from "@/lib/supabase/types";
import { stripHtml } from "@/lib/html";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Scene plain text for mention detection (single-line collapse ok for substring search). */
function scenePlainOneLine(html: string | null): string {
  return stripHtml(html ?? "").toLowerCase();
}

/** IDs of characters/world elements whose names appear in the scene text. */
export function idsMentionedInScene(
  plainOneLine: string,
  characters: Pick<Character, "id" | "name">[],
  worldElements: Pick<WorldElement, "id" | "name">[],
): { characterIds: string[]; worldIds: string[] } {
  const characterIds: string[] = [];
  for (const c of characters) {
    if (c.name && plainOneLine.includes(norm(c.name))) characterIds.push(c.id);
  }
  const worldIds: string[] = [];
  for (const w of worldElements) {
    const n = w.name?.trim();
    if (n && plainOneLine.includes(norm(n))) worldIds.push(w.id);
  }
  return { characterIds, worldIds };
}

export function formatContinuityFactsBlock(input: {
  confirmed: Pick<
    ContinuityClaim,
    | "subject_label"
    | "predicate"
    | "object_text"
    | "confidence"
    | "status"
  >[];
  tentative: Pick<
    ContinuityClaim,
    | "subject_label"
    | "predicate"
    | "object_text"
    | "confidence"
    | "status"
  >[];
}): string | null {
  const conf = input.confirmed;
  const tent = input.tentative;
  if (!conf.length && !tent.length) return null;

  const lines: string[] = [];
  lines.push(
    "CONTINUITY (from your manuscript — honor confirmed facts; treat tentative items as draft lore that may evolve)",
  );
  if (conf.length) {
    lines.push("");
    lines.push("CONFIRMED CANON (do not contradict):");
    for (const c of conf) {
      lines.push(
        `- ${c.subject_label}: ${c.predicate} — ${c.object_text} (${c.confidence})`,
      );
    }
  }
  if (tent.length) {
    lines.push("");
    lines.push("TENTATIVE (prefer over invention; still unconfirmed in Codex):");
    for (const c of tent) {
      lines.push(
        `- ${c.subject_label}: ${c.predicate} — ${c.object_text} (${c.confidence})`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

/** Loads relevant claims for AI context when working on a scene. */
export async function fetchContinuityFactsForScene(
  supabase: SupabaseClient,
  projectId: string,
  sceneHtml: string | null,
): Promise<string | null> {
  const [{ data: chars }, { data: worlds }] = await Promise.all([
    supabase.from("characters").select("id, name").eq("project_id", projectId),
    supabase.from("world_elements").select("id, name").eq("project_id", projectId),
  ]);

  const plain = scenePlainOneLine(sceneHtml);
  const { characterIds, worldIds } = idsMentionedInScene(
    plain,
    (chars ?? []) as Pick<Character, "id" | "name">[],
    (worlds ?? []) as Pick<WorldElement, "id" | "name">[],
  );

  const query = supabase
    .from("continuity_claims")
    .select(
      "subject_label, predicate, object_text, confidence, status, subject_character_id, subject_world_element_id",
    )
    .eq("project_id", projectId)
    .in("status", ["auto", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(80);

  const { data: all } = await query;
  const rows = (all ?? []) as Pick<
    ContinuityClaim,
    | "subject_label"
    | "predicate"
    | "object_text"
    | "confidence"
    | "status"
    | "subject_character_id"
    | "subject_world_element_id"
  >[];

  const filtered =
    characterIds.length || worldIds.length
      ? rows.filter((r) => {
          if (
            r.subject_character_id &&
            characterIds.includes(r.subject_character_id)
          )
            return true;
          if (
            r.subject_world_element_id &&
            worldIds.includes(r.subject_world_element_id)
          )
            return true;
          return false;
        })
      : rows.slice(0, 25);

  const confirmed = filtered.filter((r) => r.status === "confirmed").slice(0, 20);
  const tentative = filtered.filter((r) => r.status === "auto").slice(0, 20);

  return formatContinuityFactsBlock({
    confirmed,
    tentative,
  });
}
