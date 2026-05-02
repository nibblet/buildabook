import { describe, expect, it } from "vitest";
import { shouldInsertContinuityClaim } from "./extract";

describe("shouldInsertContinuityClaim", () => {
  it("drops low-confidence events", () => {
    expect(
      shouldInsertContinuityClaim({
        kind: "event",
        subject_type: "character",
        subject_label: "Ava",
        predicate: "runs",
        object_text: "across the room",
        paragraph_start: 0,
        paragraph_end: 0,
        confidence: "low",
        relationship_character_labels: [],
      }),
    ).toBe(false);
  });

  it("keeps high-confidence events with named subject", () => {
    expect(
      shouldInsertContinuityClaim({
        kind: "event",
        subject_type: "character",
        subject_label: "Ava",
        predicate: "reveals",
        object_text: "she is the alpha",
        paragraph_start: 0,
        paragraph_end: 0,
        confidence: "high",
        relationship_character_labels: [],
      }),
    ).toBe(true);
  });
});
