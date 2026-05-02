/** Safe ASCII slug for Content-Disposition filenames. */
export function slugifyForFilename(s: string): string {
  const out = s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return out || "manuscript";
}
