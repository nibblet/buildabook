import { escapeRegex } from "@/lib/mentions/character-mention-backfill";

/**
 * Replace every prose occurrence of `oldName` with `newName` in TipTap HTML.
 * Handles plain words (word-boundary, same rules as mention backfill) and
 * @mentions that use the previous canonical name.
 */
export function replaceCharacterNameInHtml(
  html: string,
  oldName: string,
  newName: string,
): { html: string; replacements: number } {
  const oldTrim = oldName.trim();
  const newTrim = newName.trim();
  if (!oldTrim || oldTrim === newTrim) {
    return { html, replacements: 0 };
  }

  let replacements = 0;
  let next = html;

  const atRe = new RegExp(`@${escapeRegex(oldTrim)}(?=\\b)`, "gi");
  next = next.replace(atRe, () => {
    replacements += 1;
    return `@${newTrim}`;
  });

  const plainRe = new RegExp(
    `(^|[^\\w@])(${escapeRegex(oldTrim)})(?=\\b)`,
    "gi",
  );
  next = next.replace(plainRe, (_m: string, prefix: string) => {
    replacements += 1;
    return `${prefix}${newTrim}`;
  });

  return { html: next, replacements };
}
