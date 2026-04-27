import type { JSONContent } from "@tiptap/core";

/** Split Partner/inline-assist plain text into paragraph nodes (matches ProseEditor insert behavior). */
export function paragraphsFromPlainText(text: string): JSONContent[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphs.map((p) => ({
    type: "paragraph",
    content: [{ type: "text", text: p }],
  }));
}
