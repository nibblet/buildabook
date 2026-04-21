import { describe, expect, it } from "vitest";
import { compileCharacter, type CompileCharacterInput } from "./character";

const baseInput: CompileCharacterInput = {
  character: {
    id: "c-1",
    project_id: "p-1",
    name: "Mara Locke",
    role: "protagonist",
    species: "human",
    archetype: "reluctant chosen one",
    appearance: "lean, dark hair",
    backstory: "Lost her sister at twelve.",
    wound: "Abandonment.",
    desire: "Safety.",
    need: "Belonging.",
    voice_notes: "Clipped; sparing with adjectives.",
    powers: null,
    aliases: ["Mar"],
    created_at: "2026-04-01T00:00:00Z",
  },
  appearances: [
    {
      scene_id: "s-1",
      chapter_id: "ch-1",
      chapter_order: 0,
      scene_order: 0,
      chapter_title: "Arrival",
      goal: "Meet the envoy.",
      conflict: "Envoy refuses.",
      outcome: "Bargain.",
    },
    {
      scene_id: "s-2",
      chapter_id: "ch-1",
      chapter_order: 0,
      scene_order: 1,
      chapter_title: "Arrival",
      goal: null,
      conflict: null,
      outcome: null,
    },
  ],
  relationships: [
    { other_name: "Kade", type: "love interest", current_state: "wary" },
  ],
  beats: [
    { title: "Meet cute", act: 1, why_it_matters: "Sets the hook." },
  ],
};

describe("compileCharacter", () => {
  it("produces a markdown body that includes name, role, voice, appearances", () => {
    const out = compileCharacter(baseInput);
    expect(out.title).toBe("Mara Locke");
    expect(out.bodyMd).toContain("# Mara Locke");
    expect(out.bodyMd).toContain("protagonist");
    expect(out.bodyMd).toContain("Clipped");
    expect(out.bodyMd).toContain("Arrival");
    expect(out.bodyMd).toContain("Kade");
  });

  it("signature is stable across equal inputs", () => {
    const a = compileCharacter(baseInput);
    const b = compileCharacter({ ...baseInput });
    expect(a.sourceSignature).toEqual(b.sourceSignature);
  });

  it("signature changes when an appearance is added", () => {
    const a = compileCharacter(baseInput);
    const b = compileCharacter({
      ...baseInput,
      appearances: [
        ...baseInput.appearances,
        {
          scene_id: "s-3",
          chapter_id: "ch-2",
          chapter_order: 1,
          scene_order: 0,
          chapter_title: "Descent",
          goal: null,
          conflict: null,
          outcome: null,
        },
      ],
    });
    expect(a.sourceSignature).not.toEqual(b.sourceSignature);
  });

  it("tolerates missing optional fields", () => {
    const thin = compileCharacter({
      character: {
        ...baseInput.character,
        role: null,
        archetype: null,
        appearance: null,
        voice_notes: null,
        wound: null,
        desire: null,
        need: null,
        aliases: [],
        backstory: null,
      },
      appearances: [],
      relationships: [],
      beats: [],
    });
    expect(thin.bodyMd).toContain("# Mara Locke");
    expect(thin.bodyMd).not.toContain("undefined");
  });
});
