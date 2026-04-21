import { describe, expect, it } from "vitest";
import { extractWikiLinkNodes } from "./wiki-link-mentions";

describe("extractWikiLinkNodes", () => {
  it("pulls targetType/targetKey/display from span[data-wiki-link]", () => {
    const html = `<p>Then <span data-wiki-link="1" data-target-type="character" data-target-key="mara-voss">Mara</span> spoke to <span data-wiki-link="1" data-target-type="character" data-target-key="kade">Kade</span>.</p>`;
    expect(extractWikiLinkNodes(html)).toEqual([
      { targetType: "character", targetKey: "mara-voss", display: "Mara" },
      { targetType: "character", targetKey: "kade", display: "Kade" },
    ]);
  });

  it("returns [] for plain HTML", () => {
    expect(extractWikiLinkNodes("<p>Nothing here</p>")).toEqual([]);
  });

  it("skips spans missing target-key", () => {
    const html = `<p><span data-wiki-link="1" data-target-type="character" data-target-key="">x</span></p>`;
    expect(extractWikiLinkNodes(html)).toEqual([]);
  });
});
