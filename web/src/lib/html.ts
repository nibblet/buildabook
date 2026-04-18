/** Strip basic HTML tags for plain-text search, embeddings, and counts. */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
