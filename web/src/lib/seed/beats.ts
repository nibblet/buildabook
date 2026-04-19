import type { WritingProfileId } from "@/lib/deployment/writing-profile";

// Beat sheets preloaded on project creation (`why_it_matters` powers teach-as-you-go).

export type SeedBeat = {
  order_index: number;
  act: 1 | 2 | 3;
  beat_type: string;
  title: string;
  description: string;
  why_it_matters: string;
  target_chapter: number;
};

export const PNR_BEATS: SeedBeat[] = [
  {
    order_index: 1,
    act: 1,
    beat_type: "ordinary_world",
    title: "Ordinary World",
    description:
      "The heroine's life before the story starts — with a glimpse of the supernatural at the edges.",
    why_it_matters:
      "Grounds the reader in who she is before things tilt. The more specific the ordinary world, the harder the paranormal reveal lands.",
    target_chapter: 1,
  },
  {
    order_index: 2,
    act: 1,
    beat_type: "meet_cute",
    title: "Meet Cute",
    description: "The couple collides. Tension sparks.",
    why_it_matters:
      "This is the reader's first hit of chemistry. It sets the emotional question the whole book will answer.",
    target_chapter: 1,
  },
  {
    order_index: 3,
    act: 1,
    beat_type: "paranormal_reveal",
    title: "Paranormal Reveal",
    description: "What he or she is, and what the rules of this world are.",
    why_it_matters:
      "Readers need the rules early so they can feel real stakes later. Withhold the reveal too long and the middle sags.",
    target_chapter: 2,
  },
  {
    order_index: 4,
    act: 1,
    beat_type: "pull_push",
    title: "Pull & Push",
    description:
      "Attraction is undeniable. So is the reason they can't have each other.",
    why_it_matters:
      "The engine of the whole middle act. Without a strong reason they can't be together, there is no tension.",
    target_chapter: 3,
  },
  {
    order_index: 5,
    act: 2,
    beat_type: "first_bond",
    title: "First Kiss / Bond Moment",
    description: "The point of no return — they cross a line.",
    why_it_matters:
      "The promise the cover made. Readers came for this moment; make it land.",
    target_chapter: 5,
  },
  {
    order_index: 6,
    act: 2,
    beat_type: "midpoint",
    title: "Midpoint Escalation",
    description: "The external threat tightens. The bond deepens.",
    why_it_matters:
      "Stops the middle from sagging. Raises the stakes on both the plot and the romance at the same time.",
    target_chapter: 6,
  },
  {
    order_index: 7,
    act: 2,
    beat_type: "false_happy",
    title: "False Happy",
    description: "They think they've won. For a moment, everything is fine.",
    why_it_matters:
      "Gives the reader a breath before the fall. The contrast is what makes the Low Point hurt.",
    target_chapter: 7,
  },
  {
    order_index: 8,
    act: 2,
    beat_type: "black_moment",
    title: "Low Point",
    description:
      "The worst fear comes true — a breakup, a betrayal, a near-death.",
    why_it_matters:
      "The emotional bottom of the story. Everything the lead feared is real. Don't resolve it too fast — let it hurt for a chapter.",
    target_chapter: 9,
  },
  {
    order_index: 9,
    act: 3,
    beat_type: "grand_gesture",
    title: "Grand Gesture",
    description: "One of them fights for the other.",
    why_it_matters:
      "Proves the love is active, not passive. The chase earns the reunion.",
    target_chapter: 10,
  },
  {
    order_index: 10,
    act: 3,
    beat_type: "climax",
    title: "Climax",
    description: "The paranormal threat is confronted and defeated.",
    why_it_matters:
      "The external plot resolves so the emotional arc can finish cleanly.",
    target_chapter: 11,
  },
  {
    order_index: 11,
    act: 3,
    beat_type: "hea",
    title: "Happily Ever After",
    description: "Union. Forever — or for now.",
    why_it_matters:
      "The genre contract. Paranormal romance readers will return the book if you skip the HEA/HFN.",
    target_chapter: 12,
  },
];

/** Eleven-beat contemporary adult romance arc (explicit heat–friendly; no paranormal hinge). */
export const EROTIC_MATURE_BEATS: SeedBeat[] = [
  {
    order_index: 1,
    act: 1,
    beat_type: "ordinary_world",
    title: "Ordinary World",
    description:
      "Her or his baseline — work, appetite for risk, what intimacy has meant before now.",
    why_it_matters:
      "Grounds desire in character. The sharper the ordinary world, the louder the chemistry reads.",
    target_chapter: 1,
  },
  {
    order_index: 2,
    act: 1,
    beat_type: "meet_spark",
    title: "Spark / Collision",
    description:
      "They notice each other — friction, curiosity, or inconvenient timing.",
    why_it_matters:
      "Readers sign up for tension before payoff. Make the spark specific, not generic.",
    target_chapter: 1,
  },
  {
    order_index: 3,
    act: 1,
    beat_type: "stakes_obstacle",
    title: "Real Obstacle",
    description:
      "Why this shouldn’t happen — ethics, career, geography, wound, third rail.",
    why_it_matters:
      "Heat without obstacle reads hollow. Name the cost of acting on attraction.",
    target_chapter: 2,
  },
  {
    order_index: 4,
    act: 1,
    beat_type: "pull_push",
    title: "Pull & Push",
    description:
      "Want rises; so does resistance — proximity, denial, negotiation.",
    why_it_matters:
      "The middle needs push-pull so escalation feels earned, not plotted.",
    target_chapter: 3,
  },
  {
    order_index: 5,
    act: 2,
    beat_type: "first_intimate_milestone",
    title: "First Crossing",
    description:
      "A milestone — kiss, confession, first scene with real vulnerability.",
    why_it_matters:
      "Signals what ‘hot’ means in this book: emotion-led, voice-led, consent-forward.",
    target_chapter: 5,
  },
  {
    order_index: 6,
    act: 2,
    beat_type: "midpoint",
    title: "Midpoint Escalation",
    description:
      "Stakes double — feelings deepen; fallout from sleeping together or nearly doing so.",
    why_it_matters:
      "Keeps Act 2 from looping sex scenes without consequence. Raise emotional price.",
    target_chapter: 6,
  },
  {
    order_index: 7,
    act: 2,
    beat_type: "false_happy",
    title: "False High",
    description:
      "They believe they’ve threaded the needle — it won’t last.",
    why_it_matters:
      "Breathing room before the collapse; contrast sells the dark moment.",
    target_chapter: 7,
  },
  {
    order_index: 8,
    act: 2,
    beat_type: "black_moment",
    title: "Low Point",
    description:
      "Exposure, betrayal fear, shame, or loss — the relationship seems impossible.",
    why_it_matters:
      "Genre readers need to doubt reunion briefly. Sit in the ache one beat.",
    target_chapter: 9,
  },
  {
    order_index: 9,
    act: 3,
    beat_type: "grand_gesture",
    title: "Proof & Pursuit",
    description:
      "Someone chooses plainly — apology, boundary reset, visible fight for the other.",
    why_it_matters:
      "Agency earns HEA. Grand doesn’t mean loud; it means unmistakable.",
    target_chapter: 10,
  },
  {
    order_index: 10,
    act: 3,
    beat_type: "climax",
    title: "Climax",
    description:
      "External and relational pressure peak; intimacy and stakes align.",
    why_it_matters:
      "Body and choice should mirror theme — release only after clarity.",
    target_chapter: 11,
  },
  {
    order_index: 11,
    act: 3,
    beat_type: "hea",
    title: "HEA / HFN",
    description:
      "Union or a happy-for-now that fits the heat you promised on the cover.",
    why_it_matters:
      "Romance readers need an emotional receipt. Close the arc, not just the bedroom door.",
    target_chapter: 12,
  },
];

/** Ten-beat science-fiction novel spine (three-act structure; romance-optional). */
export const SCI_FI_BEATS: SeedBeat[] = [
  {
    order_index: 1,
    act: 1,
    beat_type: "status_quo",
    title: "Status Quo",
    description:
      "The world as it works today — tech level, politics, scale of the story.",
    why_it_matters:
      "Readers need grounding rules before you break them. What’s normal here defines every later surprise.",
    target_chapter: 1,
  },
  {
    order_index: 2,
    act: 1,
    beat_type: "inciting_incident",
    title: "Inciting Incident",
    description:
      "Something breaks the routine — discovery, threat, invitation, crash.",
    why_it_matters:
      "Hooks the genre promise: this is what the book is *about*.",
    target_chapter: 2,
  },
  {
    order_index: 3,
    act: 1,
    beat_type: "first_plot_point",
    title: "Commitment / Lock-In",
    description:
      "The protagonist can’t pretend nothing happened; they cross into the story.",
    why_it_matters:
      "Ends Act 1 with forward motion. Without a lock-in, the middle wanders.",
    target_chapter: 4,
  },
  {
    order_index: 4,
    act: 2,
    beat_type: "fun_and_games",
    title: "Exploration & Escalation",
    description:
      "Deliver on the premise — set pieces, world reveals, competence on display.",
    why_it_matters:
      "Where SF readers buy the ticket: awe, dread, or clever implication.",
    target_chapter: 7,
  },
  {
    order_index: 5,
    act: 2,
    beat_type: "midpoint",
    title: "Midpoint Shift",
    description:
      "A revelation or reversal that raises stakes — truth costs more than ignorance.",
    why_it_matters:
      "Keeps the middle from sagging; reframes what winning means.",
    target_chapter: 12,
  },
  {
    order_index: 6,
    act: 2,
    beat_type: "forces_close_in",
    title: "Forces Close In",
    description:
      "Antagonistic pressure tightens — time, physics, ideology, rivals.",
    why_it_matters:
      "Raises external *and* internal cost so the finale feels earned.",
    target_chapter: 18,
  },
  {
    order_index: 7,
    act: 2,
    beat_type: "all_is_lost",
    title: "All Is Lost",
    description:
      "The worst credible outcome — plan fails, ally falls, truth breaks hope.",
    why_it_matters:
      "Sets up the choice that defines theme. Don’t rush the wreckage.",
    target_chapter: 24,
  },
  {
    order_index: 8,
    act: 3,
    beat_type: "dark_night",
    title: "Dark Night / Regroup",
    description:
      "Brief breath — grief, calculation, moral clarity before the push.",
    why_it_matters:
      "Lets character agency return after chaos; earns the climax.",
    target_chapter: 27,
  },
  {
    order_index: 9,
    act: 3,
    beat_type: "climax",
    title: "Climax",
    description:
      "The speculative and emotional payoff — confrontation at full stakes.",
    why_it_matters:
      "External resolution should mirror internal change (theme landing).",
    target_chapter: 32,
  },
  {
    order_index: 10,
    act: 3,
    beat_type: "resolution",
    title: "New Equilibrium",
    description:
      "Aftermath — what changed in the world and who the protagonist became.",
    why_it_matters:
      "Science fiction readers often read for *implication*. Show the cost and the glimpse forward.",
    target_chapter: 36,
  },
];

export function seedBeatsForWritingProfile(id: WritingProfileId): SeedBeat[] {
  switch (id) {
    case "pnr_dawn":
      return PNR_BEATS;
    case "sci_fi":
      return SCI_FI_BEATS;
    case "erotic_mature":
      return EROTIC_MATURE_BEATS;
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export type TropeOption = { id: string; label: string; explainer: string };

// Romance-oriented trope chips (PNR / erotic romance onboarding).
export const PNR_TROPE_OPTIONS: TropeOption[] = [
    {
      id: "fated_mates",
      label: "Fated Mates",
      explainer:
        "The universe says yes before they do. Reader's pleasure: watching them catch up.",
    },
    {
      id: "enemies_to_lovers",
      label: "Enemies to Lovers",
      explainer:
        "Opposition becomes attraction. Reader's pleasure: the exact moment hostility tips.",
    },
    {
      id: "forbidden_love",
      label: "Forbidden Love",
      explainer:
        "Love that shouldn't exist per some rule (species, family, pack). Reader's pleasure: watching them choose each other anyway.",
    },
    {
      id: "protector",
      label: "Protector",
      explainer:
        "One is shielded, one is shield. Reader's pleasure: the moment the shielded one saves the shield.",
    },
    {
      id: "bonded_by_magic",
      label: "Bonded by Magic",
      explainer:
        "A supernatural tie forces closeness. Reader's pleasure: consent inside constraint.",
    },
    {
      id: "hidden_identity",
      label: "Hidden Identity",
      explainer:
        "Someone is not what they seem. Reader's pleasure: the reveal, and the fallout.",
    },
    {
      id: "second_chance",
      label: "Second Chance (Immortal)",
      explainer:
        "They have a past. Reader's pleasure: history weighing every word.",
    },
    {
      id: "forced_proximity",
      label: "Forced Proximity",
      explainer:
        "They can't leave each other's side. Reader's pleasure: slow-burn acceleration.",
    },
    {
      id: "only_one_bed",
      label: "Only One Bed",
      explainer:
        "Single-night constraint that collapses boundaries. Reader's pleasure: the inevitability.",
    },
  ];

/** Trope / theme chips for science fiction onboarding. */
export const SCI_FI_TROPE_OPTIONS: TropeOption[] = [
  {
    id: "first_contact",
    label: "First Contact",
    explainer:
      "Meeting the other — alien, AI, or stranger intelligence. Pleasure: translation, misunderstanding, awe.",
  },
  {
    id: "hard_sf",
    label: "Hard SF",
    explainer:
      "Rules-first worldbuilding; plot turns on physics, biology, or engineering.",
  },
  {
    id: "space_opera",
    label: "Space Opera",
    explainer:
      "Big canvas, factions, stakes at civilization scale — emotion through spectacle.",
  },
  {
    id: "near_future",
    label: "Near Future",
    explainer:
      "Tomorrow’s tech or climate — pleasure: recognition, dread, or hope.",
  },
  {
    id: "cyberpunk_adjacent",
    label: "Cyberpunk-adjacent",
    explainer:
      "Bodies, corporations, networks — intimacy with systems that own you.",
  },
  {
    id: "generation_ship",
    label: "Generation Ship / Long Haul",
    explainer:
      "Time and enclosure as pressure cookers — society in a bottle.",
  },
  {
    id: "post_apocalyptic",
    label: "Post-Apocalyptic",
    explainer:
      "Ruin and remnant tech — moral choices under scarcity.",
  },
  {
    id: "climate_emergency",
    label: "Climate / Eco SF",
    explainer:
      "Planet as character — stakes tied to adaptation or collapse.",
  },
  {
    id: "ai_consciousness",
    label: "AI & Consciousness",
    explainer:
      "Mind upload, autonomy, alignment — stories about what counts as a person.",
  },
  {
    id: "time_manipulation",
    label: "Time / Causality",
    explainer:
      "Loops, dilation, paradox — plot as puzzle box.",
  },
];

export function tropeOptionsForWritingProfile(id: WritingProfileId): TropeOption[] {
  switch (id) {
    case "sci_fi":
      return SCI_FI_TROPE_OPTIONS;
    case "pnr_dawn":
    case "erotic_mature":
      return PNR_TROPE_OPTIONS;
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

/** @deprecated Use tropeOptionsForWritingProfile + profile from project */
export const TROPE_OPTIONS = PNR_TROPE_OPTIONS;
