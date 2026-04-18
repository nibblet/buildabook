/** Shared logic for turning plain names in prose into @CanonicalName mentions. */

export type CharacterNameRow = {
  name: string;
  aliases?: string[] | null;
};

export type MentionReplacement = {
  pattern: string;
  canonical: string;
};

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build replace rules: match `pattern` (name, alias, or unique first name) → `canonical` display name for @mentions.
 */
export function buildMentionReplacements(
  chars: CharacterNameRow[],
): MentionReplacement[] {
  const rows = chars
    .map((c) => ({
      canonical: c.name.trim(),
      aliases: (c.aliases ?? []).map((a) => a.trim()).filter(Boolean),
    }))
    .filter((r) => r.canonical.length > 0);

  const firstLowerCount = new Map<string, number>();
  for (const r of rows) {
    const parts = r.canonical.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const fl = parts[0].toLowerCase();
      firstLowerCount.set(fl, (firstLowerCount.get(fl) ?? 0) + 1);
    }
  }

  const pairs: MentionReplacement[] = [];
  for (const r of rows) {
    const terms = new Set<string>();
    terms.add(r.canonical);
    for (const a of r.aliases) terms.add(a);

    const parts = r.canonical.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0];
      const fl = first.toLowerCase();
      if ((firstLowerCount.get(fl) ?? 0) === 1 && first.length >= 2) {
        terms.add(first);
      }
    }

    for (const t of terms) {
      const p = t.trim();
      if (p) pairs.push({ pattern: p, canonical: r.canonical });
    }
  }

  pairs.sort((a, b) => b.pattern.length - a.pattern.length);

  const patternToCanonical = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const { pattern, canonical } of pairs) {
    const existing = patternToCanonical.get(pattern);
    if (existing === undefined) {
      patternToCanonical.set(pattern, canonical);
    } else if (existing !== canonical) {
      ambiguous.add(pattern);
    }
  }
  for (const p of ambiguous) {
    patternToCanonical.delete(p);
  }

  return Array.from(patternToCanonical.entries())
    .map(([pattern, canonical]) => ({ pattern, canonical }))
    .sort((a, b) => b.pattern.length - a.pattern.length);
}

export function applyMentionBackfill(
  content: string,
  replacements: MentionReplacement[],
): { content: string; changed: boolean } {
  let next = content;
  let changed = false;
  for (const { pattern, canonical } of replacements) {
    const trimmed = pattern.trim();
    if (!trimmed) continue;
    const re = new RegExp(`(^|[^\\w@])(${escapeRegex(trimmed)})(?=\\b)`, "gi");
    next = next.replace(re, (_full: string, prefix: string, _matched: string) => {
      void _matched;
      changed = true;
      return `${prefix}@${canonical}`;
    });
  }
  return { content: next, changed };
}

/** Which cast members appear as @pattern in plain text (after stripHtml). */
export function idsMatchingMentionsInText(
  loweredPlaintext: string,
  characters: { id: string; name: string; aliases?: string[] | null }[],
): string[] {
  const reps = buildMentionReplacements(characters);
  const matched = new Set<string>();
  for (const { pattern, canonical } of reps) {
    if (!loweredPlaintext.includes(`@${pattern}`.toLowerCase())) continue;
    const char = characters.find((c) => c.name.trim() === canonical);
    if (char) matched.add(char.id);
  }
  return [...matched];
}
