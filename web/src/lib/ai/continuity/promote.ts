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

export type CanonPatch =
  | {
      table: "characters";
      id: string;
      field:
        | "wound"
        | "desire"
        | "need"
        | "appearance"
        | "backstory"
        | "voice_notes"
        | "powers";
      value: string;
    }
  | {
      table: "world_elements";
      id: string;
      field: "description";
      value: string;
      category: string | null;
    }
  | {
      table: "relationships";
      id: string;
      field: "current_state" | "arc_notes";
      value: string;
    };

export function buildCanonPatchForClaim(
  claim: ContinuityClaim,
): CanonPatch | null {
  const pred = claim.predicate.toLowerCase();
  const obj = claim.object_text.trim();

  if (
    claim.subject_character_id &&
    (claim.kind === "attribute" || claim.kind === "entity_introduction")
  ) {
    if (pred === "fears" || pred === "wound") {
      return {
        table: "characters",
        id: claim.subject_character_id,
        field: "wound",
        value: obj || pred,
      };
    }
    if (pred === "desire") {
      return {
        table: "characters",
        id: claim.subject_character_id,
        field: "desire",
        value: obj,
      };
    }
    if (pred === "need") {
      return {
        table: "characters",
        id: claim.subject_character_id,
        field: "need",
        value: obj,
      };
    }
    if (pred === "appearance") {
      return {
        table: "characters",
        id: claim.subject_character_id,
        field: "appearance",
        value: obj,
      };
    }
    if (pred === "backstory") {
      return {
        table: "characters",
        id: claim.subject_character_id,
        field: "backstory",
        value: obj,
      };
    }
    if (pred === "voice" || pred === "voice_notes") {
      return {
        table: "characters",
        id: claim.subject_character_id,
        field: "voice_notes",
        value: obj,
      };
    }
    if (pred === "powers" || pred === "power") {
      return {
        table: "characters",
        id: claim.subject_character_id,
        field: "powers",
        value: obj,
      };
    }
    return {
      table: "characters",
      id: claim.subject_character_id,
      field: "voice_notes",
      value: `${claim.predicate}: ${obj}`,
    };
  }

  if (
    claim.subject_world_element_id &&
    (claim.kind === "attribute" ||
      claim.kind === "world_rule" ||
      claim.kind === "entity_introduction")
  ) {
    return {
      table: "world_elements",
      id: claim.subject_world_element_id,
      field: "description",
      value: obj,
      category: claim.proposed_world_category,
    };
  }

  if (claim.subject_relationship_id && claim.kind === "relationship") {
    const statePredicates = new Set([
      "status",
      "current_state",
      "together",
      "separated",
    ]);
    return {
      table: "relationships",
      id: claim.subject_relationship_id,
      field: statePredicates.has(pred) ? "current_state" : "arc_notes",
      value: `${claim.predicate}: ${obj}`,
    };
  }

  return null;
}

/**
 * Applies a confirmed continuity claim to canonical tables.
 * Keep this mapping small and explicit - easy to audit.
 */
export async function applyClaimToCanon(
  supabase: SupabaseClient,
  claim: ContinuityClaim,
): Promise<void> {
  const projectId = claim.project_id;
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

  const patch = buildCanonPatchForClaim(claim);
  if (!patch) return;

  if (patch.table === "characters") {
    const { data: row } = await supabase
      .from("characters")
      .select("*")
      .eq("id", patch.id)
      .maybeSingle();
    if (!row) return;

    const current = (row as Record<string, string | null>)[patch.field];
    await supabase
      .from("characters")
      .update({ [patch.field]: appendField(current, patch.value) })
      .eq("id", row.id);
    return;
  }

  if (patch.table === "world_elements") {
    const { data: row } = await supabase
      .from("world_elements")
      .select("*")
      .eq("id", patch.id)
      .maybeSingle();
    if (!row) return;
    await supabase
      .from("world_elements")
      .update({
        description: appendField(row.description as string | null, patch.value),
        category: (row.category as string | null) ?? patch.category,
      })
      .eq("id", row.id);
    return;
  }

  if (patch.table === "relationships") {
    const { data: row } = await supabase
      .from("relationships")
      .select("*")
      .eq("id", patch.id)
      .maybeSingle();
    if (!row) return;
    const current = (row as Record<string, string | null>)[patch.field];
    await supabase
      .from("relationships")
      .update({ [patch.field]: appendField(current, patch.value) })
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
