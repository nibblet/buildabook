function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replace every prose occurrence of `oldName` with `newName` in TipTap HTML (whole-word). */
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
  const re = new RegExp(`(^|[^\\w])(${escapeRegex(oldTrim)})(?=\\b)`, "gi");
  const next = html.replace(re, (_m: string, prefix: string) => {
    replacements += 1;
    return `${prefix}${newTrim}`;
  });

  return { html: next, replacements };
}
