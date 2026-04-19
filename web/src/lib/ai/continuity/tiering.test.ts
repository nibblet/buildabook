import { describe, expect, it } from "vitest";
import {
  contradictionDraftsFromExtractor,
  tierBDraftsFromClaims,
  type ClaimForTiering,
} from "./tiering";

describe("contradictionDraftsFromExtractor", () => {
  it("upgrades to Tier A when conflicting claim is confirmed high", () => {
    const priorById = new Map([
      ["u1", { id: "u1", status: "confirmed", confidence: "high" }],
    ]);
    const d = contradictionDraftsFromExtractor({
      contradictions: [
        {
          summary: "Eyes were green before, now blue.",
          conflicting_claim_ids: ["u1"],
          paragraph_start: 2,
          paragraph_end: 2,
          confidence: "medium",
        },
      ],
      priorById,
    });
    expect(d[0]?.tier).toBe("A");
    expect(d[0]?.paragraph_index).toBe(2);
  });
});

describe("tierBDraftsFromClaims", () => {
  it("emits Tier B for entity_introduction", () => {
    const claims: ClaimForTiering[] = [
      {
        id: "x",
        kind: "entity_introduction",
        status: "auto",
        source_paragraph_start: 1,
        subject_label: "Lyra",
        predicate: "introduced",
        object_text: "healer",
        confidence: "high",
        subject_type: "character",
      },
    ];
    const d = tierBDraftsFromClaims(claims);
    expect(d.some((x) => x.kind === "new_entity")).toBe(true);
  });
});
