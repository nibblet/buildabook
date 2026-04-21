import { describe, expect, it } from "vitest";
import { compileWorldElement, type CompileWorldInput } from "./world";

const baseInput: CompileWorldInput = {
  element: {
    id: "w-1",
    project_id: "p-1",
    category: "magic_rule",
    name: "Mating Bonds",
    description: "A lifetime telepathic link between two fated partners.",
    metadata: { severity: "high" },
    aliases: ["bond", "fated link"],
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  },
  citations: [
    {
      scene_id: "s-1",
      chapter_id: "ch-1",
      chapter_order: 0,
      scene_order: 0,
      chapter_title: "Arrival",
      mention_count: 3,
    },
  ],
};

describe("compileWorldElement", () => {
  it("renders category, description, aliases, citations", () => {
    const out = compileWorldElement(baseInput);
    expect(out.title).toBe("Mating Bonds");
    expect(out.bodyMd).toContain("# Mating Bonds");
    expect(out.bodyMd).toContain("magic_rule");
    expect(out.bodyMd).toContain("fated link");
    expect(out.bodyMd).toContain("Arrival");
  });

  it("stable signature over equal inputs", () => {
    const a = compileWorldElement(baseInput);
    const b = compileWorldElement({ ...baseInput });
    expect(a.sourceSignature).toEqual(b.sourceSignature);
  });

  it("signature differs when metadata changes", () => {
    const a = compileWorldElement(baseInput);
    const b = compileWorldElement({
      ...baseInput,
      element: { ...baseInput.element, metadata: { severity: "low" } },
    });
    expect(a.sourceSignature).not.toEqual(b.sourceSignature);
  });
});
