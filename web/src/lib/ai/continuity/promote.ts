import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContinuityClaim } from "@/lib/supabase/types";

/** Append sentence to existing text field (newline-separated). */
function appendField(
  existing: string | null | undefined,
  addition: string,
): string {
  const base = (existing ?? "").trim();
  const add = addition.trim();
  if (!add) return base;
  if (!base) return add;
  return `${base}\n${add}`;
}

/**
 * Applies a confirmed continuity claim to canonical tables.
 * Keep this mapping small and explicit — easy to audit.
 */
export async function applyClaimToCanon(
  supabase: SupabaseClient,
  claim: ContinuityClaim,
): Promise<void> {
  const projectId = claim.project_id;
  const pred = claim.predicate.toLowerCase();
  const obj = claim.object_text.trim();

  if (claim.kind === "entity_introduction" && claim.subject_type === "character") {
    const name = claim.subject_label.trim() || obj || "Unnamed";
    const { data: dup } = await supabase
      .from("characters")
      .select("id")
      .eq("project_id", projectId)
      .ilike("name", name)
      .maybeSingle();
    if (dup) return;

    await supabase.from("characters").insert({
      project_id: projectId,
      name,
      voice_notes: obj ? `Introduced in prose: ${obj}` : null,
    });
    return;
  }

  if (
    claim.subject_character_id &&
    (claim.kind === "attribute" || claim.kind === "entity_introduction")
  ) {
    const { data: row } = await supabase
      .from("characters")
      .select("*")
      .eq("id", claim.subject_character_id)
      .maybeSingle();
    if (!row) return;

    const patch: Record<string, string | null> = {};

    if (pred === "fears" || pred === "wound") {
      patch.wound = appendField(row.wound as string | null, obj || pred);
    } else if (pred === "desire") {
      patch.desire = appendField(row.desire as string | null, obj);
    } else if (pred === "need") {
      patch.need = appendField(row.need as string | null, obj);
    } else if (pred === "appearance") {
      patch.appearance = appendField(row.appearance as string | null, obj);
    } else if (pred === "backstory") {
      patch.backstory = appendField(row.backstory as string | null, obj);
    } else if (pred === "voice" || pred === "voice_notes") {
      patch.voice_notes = appendField(row.voice_notes as string | null, obj);
    } else if (pred === "powers" || pred === "power") {
      patch.powers = appendField(row.powers as string | null, obj);
    } else {
      patch.voice_notes = appendField(
        row.voice_notes as string | null,
        `${claim.predicate}: ${obj}`,
      );
    }

    if (Object.keys(patch).length) {
      await supabase.from("characters").update(patch).eq("id", row.id);
    }
    return;
  }

  if (
    claim.subject_world_element_id &&
    (claim.kind === "attribute" || claim.kind === "world_rule")
  ) {
    const { data: row } = await supabase
      .from("world_elements")
      .select("*")
      .eq("id", claim.subject_world_element_id)
      .maybeSingle();
    if (!row) return;
    await supabase
      .from("world_elements")
      .update({
        description: appendField(row.description as string | null, obj),
      })
      .eq("id", row.id);
  }
}

export async function confirmClaims(
  supabase: SupabaseClient,
  claimIds: string[],
): Promise<void> {
  const { data: rows } = await supabase
    .from("continuity_claims")
    .select("*")
    .in("id", claimIds);
  if (!rows?.length) return;

  for (const raw of rows) {
    const claim = raw as ContinuityClaim;
    if (claim.status !== "auto") continue;
    await applyClaimToCanon(supabase, claim);
    await supabase
      .from("continuity_claims")
      .update({ status: "confirmed", updated_at: new Date().toISOString() })
      .eq("id", claim.id);
  }
}
