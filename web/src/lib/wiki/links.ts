const CODE_FENCE = /```[\s\S]*?```/g;
const LINK = /\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g;

export function extractWikiLinks(md: string): string[] {
  const cleaned = md.replace(CODE_FENCE, "");
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = LINK.exec(cleaned)) !== null) {
    const name = m[1].trim();
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}
