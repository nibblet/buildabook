import { describe, expect, it } from "vitest";
import { computeSignature, entitySlug } from "./signature";

describe("computeSignature", () => {
  it("is stable across key order", () => {
    const a = computeSignature({ a: 1, b: [1, 2], c: { nested: true } });
    const b = computeSignature({ c: { nested: true }, b: [1, 2], a: 1 });
    expect(a).toEqual(b);
  });

  it("changes when a value changes", () => {
    const a = computeSignature({ x: "hello" });
    const b = computeSignature({ x: "world" });
    expect(a).not.toEqual(b);
  });

  it("returns a 64-char hex string", () => {
    const sig = computeSignature({ any: "thing" });
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("entitySlug", () => {
  it("kebab-cases latin names", () => {
    expect(entitySlug("Mara O'Neil")).toBe("mara-o-neil");
  });

  it("collapses whitespace", () => {
    expect(entitySlug("  the  High  Council  ")).toBe("the-high-council");
  });

  it("falls back to a deterministic token for empty input", () => {
    expect(entitySlug("")).toBe("untitled");
    expect(entitySlug(null)).toBe("untitled");
  });
});
