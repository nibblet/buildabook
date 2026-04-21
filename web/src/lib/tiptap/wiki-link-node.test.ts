import { describe, expect, it } from "vitest";
import { generateHTML, generateJSON } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import { WikiLink } from "./wiki-link-node";

describe("WikiLink node", () => {
  it("serializes to span[data-wiki-link] with type/key/display attrs", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Then " },
            {
              type: "wikiLink",
              attrs: {
                targetType: "character",
                targetKey: "mara-voss",
                display: "Mara",
              },
            },
            { type: "text", text: " arrived." },
          ],
        },
      ],
    };
    const html = generateHTML(doc, [StarterKit, WikiLink]);
    expect(html).toMatch(
      /<span[^>]*data-wiki-link="1"[^>]*>Mara<\/span>/,
    );
    expect(html).toContain('data-target-type="character"');
    expect(html).toContain('data-target-key="mara-voss"');
  });

  it("parses back the same shape from HTML", () => {
    const html =
      '<p><span data-wiki-link="1" data-target-type="world" data-target-key="mating-bonds">bonds</span></p>';
    const json = generateJSON(html, [StarterKit, WikiLink]);
    const node = json.content[0].content[0];
    expect(node.type).toBe("wikiLink");
    expect(node.attrs.targetType).toBe("world");
    expect(node.attrs.targetKey).toBe("mating-bonds");
    expect(node.attrs.display).toBe("bonds");
  });
});
