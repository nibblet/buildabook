import type {
  Beat,
  Character,
  OpenThread,
  Project,
  Scene,
  StyleSample,
  WorldElement,
} from "@/lib/supabase/types";

export type ContextBundle = {
  project: Project;
  tropes: string[];
  characters: Character[];
  worldElements: WorldElement[];
  openThreads: OpenThread[];
  styleSamples: StyleSample[];
  currentBeat?: Beat | null;
  currentChapterTitle?: string | null;
  currentScene?: Scene | null;
  /** @deprecated use ragContinuity */
  priorSceneSummary?: string | null;
  /** Phase 2: vector-retrieved snippets from earlier scenes */
  ragContinuity?: string | null;
};

function compactCharacter(c: Character): string {
  const bits = [
    `- ${c.name}${c.role ? ` (${c.role})` : ""}`,
    c.species ? `  species: ${c.species}` : null,
    c.wound ? `  wound: ${c.wound}` : null,
    c.desire ? `  desire: ${c.desire}` : null,
    c.need ? `  need: ${c.need}` : null,
    c.voice_notes ? `  voice: ${c.voice_notes}` : null,
    c.powers ? `  powers: ${c.powers}` : null,
  ].filter(Boolean);
  return bits.join("\n");
}

function compactWorldElement(w: WorldElement): string {
  return `- [${w.category ?? "lore"}] ${w.name ?? ""}: ${w.description ?? ""}`;
}

// Build the universal system-prompt context block (matches v2 §6).
export function buildContext(bundle: ContextBundle): string {
  const {
    project,
    tropes,
    characters,
    worldElements,
    openThreads,
    styleSamples,
    currentBeat,
    currentChapterTitle,
    currentScene,
    priorSceneSummary,
    ragContinuity,
  } = bundle;

  const defaultStyle =
    "Warm, immersive third-person, dual POV. Emotion forward, behavior over adjectives.";

  const voice = project.style_notes?.trim() || defaultStyle;

  const sampleForScope = pickStyleSample(styleSamples, currentScene);

  const lines: string[] = [];
  lines.push("You are helping an author write a paranormal romance novella.");
  lines.push("");
  lines.push("PROJECT");
  lines.push(`- Title: ${project.title}`);
  if (project.paranormal_type)
    lines.push(`- Paranormal type: ${project.paranormal_type}`);
  if (project.heat_level)
    lines.push(`- Heat level: ${project.heat_level}`);
  if (tropes.length) lines.push(`- Active tropes: ${tropes.join(", ")}`);
  lines.push("");
  lines.push("VOICE");
  lines.push(voice);
  if (sampleForScope) {
    lines.push("");
    lines.push("VOICE SAMPLE (match this cadence and word-feel):");
    lines.push(sampleForScope.content?.trim() || "");
  }
  lines.push("");

  if (characters.length) {
    lines.push("CHARACTERS IN SCOPE");
    lines.push(characters.map(compactCharacter).join("\n"));
    lines.push("");
  }

  if (worldElements.length) {
    lines.push("WORLD FACTS IN SCOPE");
    lines.push(worldElements.map(compactWorldElement).join("\n"));
    lines.push("");
  }

  const unresolved = openThreads.filter((t) => !t.resolved);
  if (unresolved.length) {
    lines.push("OPEN THREADS (do not contradict; may pay off)");
    for (const t of unresolved) lines.push(`- ${t.question}`);
    lines.push("");
  }

  if (currentBeat) {
    lines.push("CURRENT BEAT");
    lines.push(`${currentBeat.title}: ${currentBeat.description ?? ""}`);
    if (currentBeat.why_it_matters) {
      lines.push(`Why this beat matters: ${currentBeat.why_it_matters}`);
    }
    lines.push("");
  }

  if (currentChapterTitle) {
    lines.push(`CURRENT CHAPTER: ${currentChapterTitle}`);
  }
  if (currentScene) {
    lines.push("CURRENT SCENE");
    if (currentScene.goal) lines.push(`Goal: ${currentScene.goal}`);
    if (currentScene.conflict) lines.push(`Conflict: ${currentScene.conflict}`);
    if (currentScene.outcome) lines.push(`Planned outcome: ${currentScene.outcome}`);
    lines.push("");
  }

  const continuity = ragContinuity ?? priorSceneSummary;
  if (continuity) {
    lines.push("PRIOR CONTEXT (from earlier in the manuscript)");
    lines.push(continuity);
    lines.push("");
  }

  return lines.join("\n");
}

function pickStyleSample(
  samples: StyleSample[],
  scene?: Scene | null,
): StyleSample | null {
  if (!samples.length) return null;
  if (scene) {
    const goalLower = (scene.goal || "").toLowerCase();
    const pref =
      goalLower.includes("kiss") || goalLower.includes("intimate")
        ? "intimate"
        : goalLower.includes("fight") || goalLower.includes("chase")
          ? "action"
          : null;
    if (pref) {
      const match = samples.find((s) => s.label === pref);
      if (match) return match;
    }
  }
  return (
    samples.find((s) => s.is_default) ||
    samples.find((s) => s.label === "opening") ||
    samples[0]
  );
}
