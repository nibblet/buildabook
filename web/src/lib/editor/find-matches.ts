import type { Node as PMNode } from "@tiptap/pm/model";

export type FindOptions = {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
};

export type FindMatch = {
  from: number;
  to: number;
  matchText: string;
  contextBefore: string;
  contextAfter: string;
};

const CONTEXT_RADIUS = 40;

function buildRegex(query: string, opts: FindOptions): RegExp | null {
  if (!query) return null;
  let pattern = opts.regex ? query : escapeRegex(query);
  if (opts.wholeWord) pattern = `\\b${pattern}\\b`;
  const flags = opts.caseSensitive ? "g" : "gi";
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Walk a ProseMirror doc collecting matches. Returns doc positions (`from`/`to`)
 * usable directly with `editor.chain().deleteRange(...)`. Skips wikiLink nodes
 * (mention atoms re-resolve from the entity record, so renaming the prose
 * around them is the right behavior, not the link itself).
 */
export function findMatches(
  doc: PMNode,
  query: string,
  opts: FindOptions = {},
): FindMatch[] {
  const re = buildRegex(query, opts);
  if (!re) return [];

  type Segment = { text: string; pos: number };
  const segments: Segment[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "wikiLink") return false;
    if (node.isText && node.text) {
      segments.push({ text: node.text, pos });
    }
    return true;
  });

  const matches: FindMatch[] = [];
  for (const seg of segments) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(seg.text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      const from = seg.pos + m.index;
      const to = from + m[0].length;
      const before = seg.text.slice(Math.max(0, m.index - CONTEXT_RADIUS), m.index);
      const after = seg.text.slice(m.index + m[0].length, m.index + m[0].length + CONTEXT_RADIUS);
      matches.push({
        from,
        to,
        matchText: m[0],
        contextBefore: before,
        contextAfter: after,
      });
    }
  }
  return matches;
}

export { escapeRegex };
