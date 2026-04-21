import { describe, expect, it } from "vitest";
import { extractWikiLinks } from "./links";

describe("extractWikiLinks", () => {
  it("finds simple [[Name]] references", () => {
    expect(extractWikiLinks("- [[Mara]] and [[Kade]] meet")).toEqual([
      "Mara",
      "Kade",
    ]);
  });

  it("dedupes and preserves first-seen order", () => {
    expect(
      extractWikiLinks("[[Mara]] spoke to [[Kade]]. Later [[Mara]] left."),
    ).toEqual(["Mara", "Kade"]);
  });

  it("ignores code fences", () => {
    expect(extractWikiLinks("```\n[[Skip me]]\n```\n[[Keep me]]")).toEqual([
      "Keep me",
    ]);
  });

  it("strips pipe aliases `[[Target|display]]`", () => {
    expect(extractWikiLinks("[[Mating Bonds|bonds]]")).toEqual([
      "Mating Bonds",
    ]);
  });
});
