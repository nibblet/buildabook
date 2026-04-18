/** Plain-language craft explainers (v2 §14). Keys are stable slugs for UI. */
export const CRAFT_GLOSSARY: Record<
  string,
  { title: string; body: string }
> = {
  beat: {
    title: "Beat",
    body: "A story waypoint — a moment readers subconsciously expect from this genre. Skip it and the book can feel ‘off’ even when individual scenes work.",
  },
  pov: {
    title: "POV",
    body: "Whose head the reader is in. In deep third person we only know what this character knows, sees, and feels. Slipping into another character’s thoughts mid-scene usually breaks the spell.",
  },
  trope: {
    title: "Trope",
    body: "A pattern genre readers enjoy seeing again. It’s a promise, not a cliché — if you deliver it well, readers feel rewarded.",
  },
  scene: {
    title: "Scene",
    body: "The smallest chunk you usually draft in one sitting: someone wants something, something gets in the way, something changes by the end.",
  },
  chapter: {
    title: "Chapter",
    body: "A container for scenes — often built around pace and reader breath, not around one beat only.",
  },
  ordinary_world: {
    title: "Ordinary World",
    body: "Life before the story tilts — so when the paranormal hits, readers feel the contrast.",
  },
  meet_cute: {
    title: "Meet Cute",
    body: "The collision where sparks (or friction) appear between the leads. Often sets up the romance question for the whole book.",
  },
  goal: {
    title: "Goal",
    body: "What the POV character wants in this scene — concrete enough that we know if they got it.",
  },
  conflict: {
    title: "Conflict",
    body: "What stands between the character and the goal. Without conflict, the scene is just atmosphere.",
  },
  outcome: {
    title: "Outcome",
    body: "How the scene lands: win, lose, or win-but-at-a-cost. ‘Win-but’ often fuels the next chapter.",
  },
  voice: {
    title: "Voice",
    body: "How the book sounds on the page — rhythm, word choice, what the narrator notices. The team tries to preserve yours.",
  },
};
