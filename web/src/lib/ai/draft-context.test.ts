import { describe, expect, it } from "vitest";
import { buildPartnerDraftContext, type DraftScene } from "./draft-context";

function scene(patch: Partial<DraftScene>): DraftScene {
  return {
    id: "scene-1",
    title: "Moonlit Bargain",
    goal: "Mara wants Elias to admit what he knows.",
    conflict: "Elias refuses to risk the curse spreading.",
    outcome: "Mara leaves with a clue but not the truth.",
    content: "",
    order_index: 1,
    chapter_id: "chapter-1",
    ...patch,
  };
}

describe("buildPartnerDraftContext", () => {
  it("uses current scene prose when the scene already has meaningful content", () => {
    const currentProse = Array.from(
      { length: 130 },
      (_, i) => `current${i}`,
    ).join(" ");
    const context = buildPartnerDraftContext({
      currentScene: scene({
        content:
          `<p>Mara kept one hand on the iron gate while Elias watched from the chapel steps. ${currentProse}</p>`,
      }),
      previousScene: scene({
        title: "Previous Scene",
        content: "<p>This should not be included once the current scene has prose.</p>",
      }),
    });

    expect(context).toContain("DRAFT CONTEXT");
    expect(context).toContain("CURRENT SCENE PROSE SO FAR");
    expect(context).toContain("Mara kept one hand on the iron gate");
    expect(context).not.toContain("PREVIOUS SCENE CONTEXT");
  });

  it("includes previous scene context when the current scene is empty", () => {
    const context = buildPartnerDraftContext({
      currentScene: scene({ content: "" }),
      previousScene: scene({
        title: "The Broken Threshold",
        goal: "Mara escapes the archive.",
        conflict: "The wards are waking up.",
        outcome: "She reaches Elias with stolen pages.",
        content: "<p>The last ward cracked as Mara ran into the rain.</p>",
      }),
    });

    expect(context).toContain("PREVIOUS SCENE CONTEXT");
    expect(context).toContain("The Broken Threshold");
    expect(context).toContain("Mara escapes the archive.");
    expect(context).toContain("The last ward cracked");
  });

  it("omits blueprint scratchpad data", () => {
    const context = buildPartnerDraftContext({
      currentScene: scene({
        content: "<p>Mara waited.</p>",
        blueprint: {
          intent: "SECRET SCRATCHPAD INTENT",
          reader_takeaway: "SECRET SCRATCHPAD TAKEAWAY",
        },
      }),
      previousScene: null,
    });

    expect(context).not.toContain("SECRET SCRATCHPAD");
  });

  it("truncates long current scene prose to opening and trailing excerpts", () => {
    const middle = Array.from({ length: 1400 }, (_, i) => `middle${i}`).join(" ");
    const context = buildPartnerDraftContext({
      currentScene: scene({
        content: `<p>opening words begin here ${middle} final words end here</p>`,
      }),
      previousScene: null,
    });

    expect(context).toContain("CURRENT SCENE OPENING EXCERPT");
    expect(context).toContain("CURRENT SCENE TRAILING EXCERPT");
    expect(context).toContain("opening words begin here");
    expect(context).toContain("final words end here");
    expect(context).toContain("[middle prose omitted]");
  });
});
