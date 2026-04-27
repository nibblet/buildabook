import { describe, expect, it } from "vitest";
import type { ContinuityClaim } from "@/lib/supabase/types";
import { buildCanonPatchForClaim } from "./promote";

function claim(overrides: Partial<ContinuityClaim>): ContinuityClaim {
  return {
    id: "claim-1",
    project_id: "project-1",
    source_scene_id: "scene-1",
    source_paragraph_start: 0,
    source_paragraph_end: 0,
    kind: "attribute",
    subject_type: "character",
    subject_label: "Ava",
    subject_character_id: null,
    subject_world_element_id: null,
    subject_relationship_id: null,
    proposed_destination_type: null,
    proposed_world_category: null,
    resolution_status: "unresolved",
    resolution_note: null,
    predicate: "appearance",
    object_text: "dark curls",
    confidence: "high",
    status: "auto",
    superseded_by: null,
    tier: null,
    extractor_version: 1,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("buildCanonPatchForClaim", () => {
  it("maps relationship claims to arc notes", () => {
    expect(
      buildCanonPatchForClaim(
        claim({
          kind: "relationship",
          subject_type: "relationship",
          subject_relationship_id: "rel-1",
          predicate: "distrusts",
          object_text: "Ava distrusts Marcus after the ambush.",
        }),
      ),
    ).toEqual({
      table: "relationships",
      id: "rel-1",
      field: "arc_notes",
      value: "distrusts: Ava distrusts Marcus after the ambush.",
    });
  });

  it("maps relationship status claims to current state", () => {
    expect(
      buildCanonPatchForClaim(
        claim({
          kind: "relationship",
          subject_type: "relationship",
          subject_relationship_id: "rel-1",
          predicate: "status",
          object_text: "Ava and Marcus are estranged.",
        }),
      ),
    ).toEqual({
      table: "relationships",
      id: "rel-1",
      field: "current_state",
      value: "status: Ava and Marcus are estranged.",
    });
  });

  it("maps world introductions to description with category preserved", () => {
    expect(
      buildCanonPatchForClaim(
        claim({
          kind: "entity_introduction",
          subject_type: "world_element",
          subject_world_element_id: "world-1",
          proposed_world_category: "organization",
          predicate: "introduced",
          object_text: "The Glass Court controls the port.",
        }),
      ),
    ).toEqual({
      table: "world_elements",
      id: "world-1",
      field: "description",
      value: "The Glass Court controls the port.",
      category: "organization",
    });
  });
});
