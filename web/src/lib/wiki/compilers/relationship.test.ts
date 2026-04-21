import { describe, expect, it } from "vitest";
import { compileRelationship } from "./relationship";

describe("compileRelationship", () => {
  it("renders the arc and intensity curve", () => {
    const out = compileRelationship({
      relationship: {
        id: "r-1",
        project_id: "p-1",
        char_a_id: "a-1",
        char_b_id: "b-1",
        type: "mates",
        current_state: "bonded",
        arc_notes: "Slow burn to bond.",
        created_at: "2026-04-01T00:00:00Z",
      },
      charA: { id: "a-1", name: "Mara" },
      charB: { id: "b-1", name: "Kade" },
      beats: [
        {
          chapter_order: 0,
          scene_order: 0,
          chapter_title: "Arrival",
          beat_label: "first spark",
          intensity: 2,
          notes: "Eyes meet.",
        },
        {
          chapter_order: 1,
          scene_order: 0,
          chapter_title: "Descent",
          beat_label: "rupture",
          intensity: -3,
          notes: "Secret revealed.",
        },
      ],
    });

    expect(out.title).toBe("Mara × Kade");
    expect(out.bodyMd).toContain("# Mara × Kade");
    expect(out.bodyMd).toContain("[[Mara]]");
    expect(out.bodyMd).toContain("[[Kade]]");
    expect(out.bodyMd).toContain("first spark");
    expect(out.bodyMd).toContain("+2");
    expect(out.bodyMd).toContain("-3");
  });
});
