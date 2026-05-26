/** Split draft on blank lines — keeps dialogue line breaks inside a paragraph together. */
export function splitDraftIntoParagraphs(draftText: string): string[] {
  const normalized = draftText.replace(/\r\n/g, "\n");
  const parts = normalized.split(/\n\s*\n+/);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}
