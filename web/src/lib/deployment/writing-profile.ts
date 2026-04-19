/** Server-driven deployment slice: same DB, genre/prompts locked per Vercel deploy (WRITING_PROFILE). */

export const WRITING_PROFILE_IDS = ["pnr_dawn", "erotic_mature"] as const;

export type WritingProfileId = (typeof WRITING_PROFILE_IDS)[number];

export function parseWritingProfile(
  raw: string | null | undefined,
): WritingProfileId {
  if (
    raw &&
    (WRITING_PROFILE_IDS as readonly string[]).includes(raw)
  ) {
    return raw as WritingProfileId;
  }
  return "pnr_dawn";
}

/** Resolve from process.env (optional in local dev; defaults to pnr_dawn). Validates when set. */
export function writingProfileFromEnv(): WritingProfileId {
  const raw = process.env.WRITING_PROFILE?.trim();
  if (!raw) return "pnr_dawn";
  if (!(WRITING_PROFILE_IDS as readonly string[]).includes(raw)) {
    throw new Error(
      `Invalid WRITING_PROFILE "${raw}". Expected one of: ${WRITING_PROFILE_IDS.join(", ")}`,
    );
  }
  return raw as WritingProfileId;
}

export type WritingProfilePrompts = {
  missionLine: string;
  /** Profiler: "genre conventions for …" */
  genreForConventions: string;
  specialistTagline: string;
  specialistDirective: string;
  extractEditorDescription: string;
};

export function writingProfilePrompts(
  id: WritingProfileId,
): WritingProfilePrompts {
  switch (id) {
    case "pnr_dawn":
      return {
        missionLine:
          "You are helping an author write a paranormal romance novella.",
        genreForConventions: "paranormal romance",
        specialistTagline: "Paranormal romance genre expert.",
        specialistDirective: `You are a paranormal romance genre expert. Do not write prose. Answer the author's question with reference to PNR reader expectations and convention. When you cite a convention, name it and explain in one sentence why it works for readers. If the author's instinct diverges from convention, say so neutrally and name the trade-off. Keep the response under 250 words.`,
        extractEditorDescription:
          "expert paranormal-romance developmental editor",
      };
    case "erotic_mature":
      return {
        missionLine:
          "You are helping an author write an adult erotic romance novel.",
        genreForConventions: "adult erotic romance",
        specialistTagline: "Adult erotic romance genre expert.",
        specialistDirective: `You are an adult erotic romance genre expert. Do not write prose. Answer the author's question with reference to reader expectations and conventions for emotionally grounded adult romance with explicit intimate content. When you cite a convention, name it and explain in one sentence why it works for readers. If the author's instinct diverges from convention, say so neutrally and name the trade-off. Keep the response under 250 words.`,
        extractEditorDescription:
          "expert developmental editor for adult erotic romance fiction",
      };
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export function newProjectDefaults(id: WritingProfileId): {
  title: string;
  subgenre: string;
  heat_level: string;
  target_wordcount: number;
} {
  switch (id) {
    case "pnr_dawn":
      return {
        title: "Untitled Novella",
        subgenre: "paranormal_romance",
        heat_level: "steamy",
        target_wordcount: 30000,
      };
    case "erotic_mature":
      return {
        title: "Untitled Novel",
        subgenre: "erotic_romance",
        heat_level: "explicit",
        target_wordcount: 30000,
      };
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export function shouldSeedPnrBeats(id: WritingProfileId): boolean {
  return id === "pnr_dawn";
}
