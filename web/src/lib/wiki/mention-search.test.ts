import { describe, expect, it } from "vitest";
import { mergeMentionCandidates, type MentionCandidate } from "./mention-search";

describe("mergeMentionCandidates", () => {
  it("unions character, world, and wiki-doc-only rows", () => {
    const chars: MentionCandidate[] = [
      { targetType: "character", targetKey: "mara-voss", display: "Mara Voss" },
    ];
    const worlds: MentionCandidate[] = [
      {
        targetType: "world",
        targetKey: "mating-bonds",
        display: "Mating Bonds",
      },
    ];
    const docs: MentionCandidate[] = [
      {
        targetType: "thread",
        targetKey: "unresolved-ship",
        display: "Unresolved: ship's origin",
      },
    ];
    const merged = mergeMentionCandidates({ chars, worlds, docs });
    expect(merged.map((m) => m.targetType).sort()).toEqual([
      "character",
      "thread",
      "world",
    ]);
  });

  it("drops wiki-doc rows whose (type,key) already came from raw tables", () => {
    const chars: MentionCandidate[] = [
      { targetType: "character", targetKey: "mara-voss", display: "Mara Voss" },
    ];
    const docs: MentionCandidate[] = [
      {
        targetType: "character",
        targetKey: "mara-voss",
        display: "Mara (compiled)",
      },
    ];
    const merged = mergeMentionCandidates({ chars, worlds: [], docs });
    expect(merged).toHaveLength(1);
    expect(merged[0].display).toBe("Mara Voss");
  });

  it("sorts by display name, case-insensitive", () => {
    const merged = mergeMentionCandidates({
      chars: [
        { targetType: "character", targetKey: "zeb", display: "Zeb" },
        { targetType: "character", targetKey: "ana", display: "Ana" },
      ],
      worlds: [],
      docs: [],
    });
    expect(merged.map((m) => m.display)).toEqual(["Ana", "Zeb"]);
  });
});
