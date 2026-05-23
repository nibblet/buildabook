import { splitDraftIntoParagraphs } from "@/lib/ai/extract";

/** Split plain prose into numbered paragraphs (same logic as continuity extract). */
export function paragraphsFromPlainText(plain: string): string[] {
  return splitDraftIntoParagraphs(plain);
}

/** True when two inclusive paragraph ranges overlap. */
export function paragraphRangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Map a plain-text selection to inclusive scene paragraph indices by matching
 * paragraph text against the selection (normalized whitespace).
 */
export function paragraphRangeFromSelection(
  paragraphs: string[],
  selectedPlain: string,
): { start: number; end: number } | null {
  const sel = selectedPlain.replace(/\s+/g, " ").trim();
  if (!sel || paragraphs.length === 0) return null;

  const normalizedParas = paragraphs.map((p) => p.replace(/\s+/g, " ").trim());
  const nonEmptyIndices = normalizedParas
    .map((p, i) => (p ? i : -1))
    .filter((i) => i >= 0);
  if (nonEmptyIndices.length === 0) return null;

  let start = -1;
  let end = -1;

  for (let i = 0; i < paragraphs.length; i++) {
    const p = normalizedParas[i];
    if (!p) continue;

    const directMatch = sel.includes(p) || p.includes(sel);
    let partialMatch = false;
    if (!directMatch && p.length >= 12) {
      for (let len = Math.min(p.length, 48); len >= 12; len--) {
        if (sel.includes(p.slice(0, len))) {
          partialMatch = true;
          break;
        }
      }
    }

    if (directMatch || partialMatch) {
      if (start < 0) start = i;
      end = i;
    }
  }

  if (start >= 0 && end >= start) {
    return { start, end };
  }

  // Fallback: find paragraphs whose combined text contains the selection.
  for (let i = 0; i < paragraphs.length; i++) {
    for (let j = i; j < paragraphs.length; j++) {
      const block = normalizedParas.slice(i, j + 1).filter(Boolean).join(" ");
      if (block && (block.includes(sel) || sel.includes(block))) {
        return { start: i, end: j };
      }
    }
  }

  // Single-paragraph substring match (partial selection within one block).
  for (let i = 0; i < paragraphs.length; i++) {
    const p = normalizedParas[i];
    if (!p) continue;
    const words = sel.split(" ").filter(Boolean);
    if (words.length >= 3) {
      const head = words.slice(0, Math.min(8, words.length)).join(" ");
      const tail = words.slice(-Math.min(8, words.length)).join(" ");
      if (p.includes(head) || p.includes(tail)) {
        return { start: i, end: i };
      }
    }
  }

  return null;
}

export function validateParagraphRange(
  paragraphs: string[],
  paragraphStart: number,
  paragraphEnd: number,
): { ok: true } | { ok: false; error: string } {
  if (paragraphs.length === 0) {
    return { ok: false, error: "Scene has no prose paragraphs." };
  }
  if (
    paragraphStart < 0 ||
    paragraphEnd < 0 ||
    paragraphStart >= paragraphs.length ||
    paragraphEnd >= paragraphs.length
  ) {
    return { ok: false, error: "Paragraph range is out of bounds." };
  }
  if (paragraphStart > paragraphEnd) {
    return { ok: false, error: "Invalid paragraph range." };
  }
  const slice = paragraphs.slice(paragraphStart, paragraphEnd + 1);
  if (!slice.some((p) => p.trim())) {
    return { ok: false, error: "Selected range has no prose content." };
  }
  return { ok: true };
}

/** TipTap doc positions → inclusive paragraph indices (paragraph nodes only). */
export function paragraphRangeFromEditorPositions(
  doc: {
    descendants: (
      fn: (
        node: { type: { name: string }; nodeSize: number },
        pos: number,
      ) => boolean | void,
    ) => void;
  },
  from: number,
  to: number,
): { start: number; end: number } | null {
  if (from === to) return null;

  const ranges: { index: number; start: number; end: number }[] = [];
  let idx = 0;
  doc.descendants((node, pos) => {
    if (node.type.name === "paragraph") {
      ranges.push({ index: idx++, start: pos, end: pos + node.nodeSize });
    }
    return true;
  });

  if (ranges.length === 0) return null;

  let start = -1;
  let end = -1;
  for (const r of ranges) {
    const overlaps = from < r.end && to > r.start;
    if (overlaps) {
      if (start < 0) start = r.index;
      end = r.index;
    }
  }

  if (start < 0 || end < 0) return null;
  return { start, end };
}
