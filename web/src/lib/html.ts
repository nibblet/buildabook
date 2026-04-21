/** Strip basic HTML tags for plain-text search, embeddings, and counts. */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Stable prose identity for deduping saves and skipping expensive post-save work. */
export function prosePlainFingerprint(html: string): string {
  return stripHtml(html ?? "").replace(/\s+/g, " ").trim();
}
