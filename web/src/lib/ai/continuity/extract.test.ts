import { describe, expect, it } from "vitest";
import {
  paragraphRangeFromEditorPositions,
  paragraphRangeFromSelection,
  paragraphRangesOverlap,
  paragraphsFromPlainText,
  validateParagraphRange,
} from "./paragraph-range";

describe("paragraphRangesOverlap", () => {
  it("detects overlap", () => {
    expect(paragraphRangesOverlap(0, 2, 2, 4)).toBe(true);
    expect(paragraphRangesOverlap(0, 1, 3, 4)).toBe(false);
    expect(paragraphRangesOverlap(5, 5, 5, 5)).toBe(true);
  });
});

describe("paragraphRangeFromSelection", () => {
  const paragraphs = paragraphsFromPlainText(
    "First paragraph here.\n\nSecond paragraph with detail.\n\nThird ends the scene.",
  );

  it("maps selection spanning two paragraphs", () => {
    const range = paragraphRangeFromSelection(
      paragraphs,
      "First paragraph here.\n\nSecond paragraph",
    );
    expect(range).toEqual({ start: 0, end: 1 });
  });

  it("maps partial selection within one paragraph", () => {
    const range = paragraphRangeFromSelection(
      paragraphs,
      "Second paragraph with detail",
    );
    expect(range).toEqual({ start: 1, end: 1 });
  });

  it("returns null for empty selection", () => {
    expect(paragraphRangeFromSelection(paragraphs, "")).toBeNull();
  });
});

describe("validateParagraphRange", () => {
  const paragraphs = ["A", "B", "C"];

  it("accepts valid range", () => {
    expect(validateParagraphRange(paragraphs, 0, 1)).toEqual({ ok: true });
  });

  it("rejects out of bounds", () => {
    expect(validateParagraphRange(paragraphs, 0, 5).ok).toBe(false);
  });

  it("rejects empty slice", () => {
    expect(validateParagraphRange(["", ""], 0, 1).ok).toBe(false);
  });
});

describe("paragraphRangeFromEditorPositions", () => {
  it("maps prosemirror positions to paragraph indices", () => {
    const mockDoc = {
      descendants(
        fn: (
          node: { type: { name: string }; nodeSize: number },
          pos: number,
        ) => boolean | void,
      ) {
        fn({ type: { name: "paragraph" }, nodeSize: 12 }, 1);
        fn({ type: { name: "paragraph" }, nodeSize: 14 }, 13);
        fn({ type: { name: "paragraph" }, nodeSize: 10 }, 27);
      },
    };
    expect(paragraphRangeFromEditorPositions(mockDoc, 14, 20)).toEqual({
      start: 1,
      end: 1,
    });
    expect(paragraphRangeFromEditorPositions(mockDoc, 2, 30)).toEqual({
      start: 0,
      end: 2,
    });
  });
});

describe("shouldInsertContinuityClaim overlap merge", () => {
  it("overlap helper supports claim supersede filtering", () => {
    const extractRange = { start: 2, end: 4 };
    const claims = [
      { start: 0, end: 1 },
      { start: 3, end: 3 },
      { start: 5, end: 6 },
    ];
    const toSupersede = claims.filter((c) =>
      paragraphRangesOverlap(
        c.start,
        c.end,
        extractRange.start,
        extractRange.end,
      ),
    );
    expect(toSupersede).toEqual([{ start: 3, end: 3 }]);
  });
});
