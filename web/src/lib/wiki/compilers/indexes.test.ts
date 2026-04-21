import { describe, expect, it } from "vitest";
import { compileThreadsIndex, compileStorylineIndex } from "./indexes";

describe("compileThreadsIndex", () => {
  it("separates open and resolved threads", () => {
    const out = compileThreadsIndex({
      threads: [
        {
          id: "t-1",
          question: "Who sent the letter?",
          resolved: false,
          opened_chapter_title: "Arrival",
          resolved_chapter_title: null,
        },
        {
          id: "t-2",
          question: "Was the envoy lying?",
          resolved: true,
          opened_chapter_title: "Arrival",
          resolved_chapter_title: "Descent",
        },
      ],
    });

    expect(out.title).toBe("Open threads");
    expect(out.bodyMd).toContain("## Open");
    expect(out.bodyMd).toContain("Who sent the letter?");
    expect(out.bodyMd).toContain("## Resolved");
    expect(out.bodyMd).toContain("Was the envoy lying?");
  });
});

describe("compileStorylineIndex", () => {
  it("renders chapters and beats in order", () => {
    const out = compileStorylineIndex({
      chapters: [
        {
          id: "ch-1",
          title: "Arrival",
          order: 0,
          status: "done",
          wordcount: 3200,
          synopsis: "Mara meets the envoy.",
          scenes: [
            { id: "s-1", title: "Gate", order: 0, goal: "Enter.", status: "done" },
            { id: "s-2", title: "Bargain", order: 1, goal: null, status: "done" },
          ],
        },
        {
          id: "ch-2",
          title: "Descent",
          order: 1,
          status: "drafting",
          wordcount: 800,
          synopsis: null,
          scenes: [],
        },
      ],
      beats: [
        { title: "Meet cute", act: 1, why_it_matters: "Hook." },
      ],
    });

    expect(out.bodyMd).toContain("# Storyline");
    expect(out.bodyMd).toContain("Arrival");
    expect(out.bodyMd).toContain("Descent");
    expect(out.bodyMd).toContain("Meet cute");
  });
});
