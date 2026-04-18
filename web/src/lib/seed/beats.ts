// The 11-beat paranormal-romance novella beat sheet, preloaded on project
// creation. `why_it_matters` is shown inline in the teach-as-you-go layer.

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

// Default trope options with one-line "what readers expect" explainers.
export const TROPE_OPTIONS: { id: string; label: string; explainer: string }[] =
  [
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
