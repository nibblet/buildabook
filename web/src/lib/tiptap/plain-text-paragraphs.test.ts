import { describe, expect, it } from "vitest";
import { paragraphsFromPlainText } from "./plain-text-paragraphs";

describe("paragraphsFromPlainText", () => {
  it("splits on double newlines and trims", () => {
    const nodes = paragraphsFromPlainText("First.\n\nSecond.");
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "First." }],
    });
    expect(nodes[1]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Second." }],
    });
  });

  it("returns empty array for whitespace-only", () => {
    expect(paragraphsFromPlainText("   \n\n  ")).toEqual([]);
  });
});
