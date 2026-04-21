import Mention from "@tiptap/extension-mention";
import { mergeAttributes } from "@tiptap/core";

export const WikiLink = Mention.extend({
  name: "wikiLink",
  priority: 200,
  addAttributes() {
    return {
      targetType: {
        default: "character",
        parseHTML: (el) => el.getAttribute("data-target-type") ?? "character",
        renderHTML: (attrs) => ({ "data-target-type": attrs.targetType }),
      },
      targetKey: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-target-key") ?? "",
        renderHTML: (attrs) => ({ "data-target-key": attrs.targetKey }),
      },
      display: {
        default: "",
        parseHTML: (el) => el.textContent ?? "",
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-wiki-link]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-wiki-link": "1" }),
      node.attrs.display || node.attrs.targetKey,
    ];
  },
  renderText({ node }) {
    return `[[${node.attrs.display || node.attrs.targetKey}]]`;
  },
});
