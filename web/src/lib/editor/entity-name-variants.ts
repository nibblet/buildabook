import { escapeRegex } from "./find-matches";

export type EntityRenameSpec = {
  /** Canonical (current) name. */
  canonical: string;
  /** Other known forms — aliases, nicknames, prior names. */
  aliases: string[];
  /** What to replace with. */
  newName: string;
};

export type EntityRenameRule = {
  /** Single regex matching every variant + possessives. */
  pattern: RegExp;
  /** Function turning a matched string into its replacement. Handles possessives. */
  replace: (matched: string) => string;
};

/**
 * Build a single regex covering name + aliases, with `\b` word boundaries
 * and an optional possessive `'s` group. Longest variants first so multi-word
 * names win over their first-name prefix.
 */
export function buildEntityRenameRule(spec: EntityRenameSpec): EntityRenameRule | null {
  const variants = [spec.canonical, ...spec.aliases]
    .map((s) => s.trim())
    .filter(Boolean);
  if (variants.length === 0) return null;

  const unique = Array.from(new Set(variants)).sort((a, b) => b.length - a.length);
  const alt = unique.map(escapeRegex).join("|");
  const pattern = new RegExp(`\\b(?:${alt})(?:'s|’s)?\\b`, "g");

  const newName = spec.newName.trim();
  return {
    pattern,
    replace: (matched: string) => {
      const possessive = /['’]s$/.exec(matched);
      if (possessive) {
        return `${newName}${possessive[0]}`;
      }
      return newName;
    },
  };
}
