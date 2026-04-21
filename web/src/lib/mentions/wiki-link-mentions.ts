import type { MentionCandidate } from "@/lib/wiki/mention-search";

const TAG = /<span\b[^>]*\bdata-wiki-link\b[^>]*>([\s\S]*?)<\/span>/g;
const ATTR = (name: string) =>
  new RegExp(`\\bdata-${name}\\s*=\\s*"([^"]*)"`, "i");

export function extractWikiLinkNodes(html: string): MentionCandidate[] {
  const out: MentionCandidate[] = [];
  let m: RegExpExecArray | null;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(html)) !== null) {
    const span = m[0];
    const targetType = span.match(ATTR("target-type"))?.[1] ?? "";
    const targetKey = span.match(ATTR("target-key"))?.[1] ?? "";
    const display = m[1].replace(/<[^>]*>/g, "").trim();
    if (!targetKey) continue;
    out.push({
      targetType: targetType as MentionCandidate["targetType"],
      targetKey,
      display,
    });
  }
  return out;
}
