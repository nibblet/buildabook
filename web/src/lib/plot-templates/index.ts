import type { SeedBeat } from "@/lib/seed/beats";

export type PlotTemplateId =
  | "save_the_cat"
  | "three_act"
  | "seven_point"
  | "heros_journey"
  | "romance_beat_sheet";

export type PlotTemplate = {
  id: PlotTemplateId;
  name: string;
  summary: string;
  bestFor: string;
  beats: SeedBeat[];
};

const SAVE_THE_CAT: PlotTemplate = {
  id: "save_the_cat",
  name: "Save the Cat",
  summary:
    "Blake Snyder's 15-beat sheet. Strong for commercial fiction — each beat targets a percentage of the book.",
  bestFor: "Commercial novels, thrillers, contemporary, YA",
  beats: [
    {
      order_index: 1,
      act: 1,
      beat_type: "stc_opening_image",
      title: "Opening Image",
      description:
        "A single visual that captures the protagonist's starting world — tone, mood, the 'before' snapshot.",
      why_it_matters:
        "Sets tone and baseline so the ending image can mirror it to show change.",
      target_chapter: 1,
    },
    {
      order_index: 2,
      act: 1,
      beat_type: "stc_theme_stated",
      title: "Theme Stated",
      description:
        "Someone (not the hero) voices the story's thematic truth. The hero doesn't get it yet.",
      why_it_matters:
        "Plants the question the whole book answers. Readers feel the arc land because it was promised here.",
      target_chapter: 1,
    },
    {
      order_index: 3,
      act: 1,
      beat_type: "stc_setup",
      title: "Setup",
      description:
        "Show the status quo — the hero's flaws, wants, and six things that need fixing.",
      why_it_matters:
        "The more specific the ordinary world, the more the call to adventure disrupts.",
      target_chapter: 1,
    },
    {
      order_index: 4,
      act: 1,
      beat_type: "stc_catalyst",
      title: "Catalyst",
      description:
        "The life-changing event. Telegram, fired, dumped, meet-cute, body in the trunk.",
      why_it_matters:
        "The spark. Without it the story doesn't start; it just describes.",
      target_chapter: 2,
    },
    {
      order_index: 5,
      act: 1,
      beat_type: "stc_debate",
      title: "Debate",
      description:
        "The hero asks: can I do this? Do I have to? What's the cost?",
      why_it_matters:
        "Proves the choice is costly. A hero who jumps without doubt hasn't really chosen.",
      target_chapter: 3,
    },
    {
      order_index: 6,
      act: 2,
      beat_type: "stc_break_into_two",
      title: "Break Into Two",
      description:
        "The hero commits. Crosses the threshold from old world to new.",
      why_it_matters:
        "Act break one. Readers need a clean door to know we've entered the story proper.",
      target_chapter: 4,
    },
    {
      order_index: 7,
      act: 2,
      beat_type: "stc_b_story",
      title: "B Story",
      description:
        "A subplot — usually romance or mentor — that will carry the theme.",
      why_it_matters:
        "The emotional throughline. Themes are best delivered sideways, not head-on.",
      target_chapter: 5,
    },
    {
      order_index: 8,
      act: 2,
      beat_type: "stc_fun_and_games",
      title: "Fun and Games",
      description:
        "The promise of the premise. Why readers bought this book — deliver it.",
      why_it_matters:
        "If a stranger could only read 40 pages, these are the pages that must sell the cover.",
      target_chapter: 7,
    },
    {
      order_index: 9,
      act: 2,
      beat_type: "stc_midpoint",
      title: "Midpoint",
      description:
        "False victory or false defeat. Stakes raised. A party, a twist, a truth.",
      why_it_matters:
        "Stops Act 2 sagging. The story pivots from want to need.",
      target_chapter: 10,
    },
    {
      order_index: 10,
      act: 2,
      beat_type: "stc_bad_guys_close_in",
      title: "Bad Guys Close In",
      description:
        "External and internal antagonists regroup and tighten. The team starts to fracture.",
      why_it_matters:
        "Pressure builds until the hero's old tools fail. Sets up the All Is Lost.",
      target_chapter: 12,
    },
    {
      order_index: 11,
      act: 2,
      beat_type: "stc_all_is_lost",
      title: "All Is Lost",
      description:
        "The worst happens. A mentor dies, a plan fails, a truth shatters.",
      why_it_matters:
        "The false floor drops. Needed so the climb back feels earned.",
      target_chapter: 14,
    },
    {
      order_index: 12,
      act: 2,
      beat_type: "stc_dark_night",
      title: "Dark Night of the Soul",
      description:
        "The hero sits with the loss. No plans, no gimmicks — grief, then clarity.",
      why_it_matters:
        "Character change happens here, not in the climax. The climax only shows it.",
      target_chapter: 15,
    },
    {
      order_index: 13,
      act: 3,
      beat_type: "stc_break_into_three",
      title: "Break Into Three",
      description:
        "An insight from the B Story hands the hero the missing piece.",
      why_it_matters:
        "Ties theme to plot mechanically. This is why the subplot existed.",
      target_chapter: 16,
    },
    {
      order_index: 14,
      act: 3,
      beat_type: "stc_finale",
      title: "Finale",
      description:
        "Gathering team, executing plan, high tower surprise, dig deep down, execution of new plan.",
      why_it_matters:
        "Convergence. External and internal plots resolve together.",
      target_chapter: 18,
    },
    {
      order_index: 15,
      act: 3,
      beat_type: "stc_final_image",
      title: "Final Image",
      description:
        "Mirror of the opening image — proof of change.",
      why_it_matters:
        "Readers feel the arc when the last page rhymes with the first.",
      target_chapter: 20,
    },
  ],
};

const THREE_ACT: PlotTemplate = {
  id: "three_act",
  name: "Three-Act Structure",
  summary:
    "The classical spine — setup, confrontation, resolution — with two major turning points.",
  bestFor: "Any genre; good scaffold when you want freedom inside each act",
  beats: [
    {
      order_index: 1,
      act: 1,
      beat_type: "three_act_hook",
      title: "Hook",
      description:
        "Open with a question, image, or situation that demands the reader keeps reading.",
      why_it_matters:
        "Page-one economy. Readers decide to stay in the first few paragraphs.",
      target_chapter: 1,
    },
    {
      order_index: 2,
      act: 1,
      beat_type: "three_act_inciting_incident",
      title: "Inciting Incident",
      description:
        "The disruption that makes the status quo unsustainable.",
      why_it_matters:
        "Signals what the book is about. Everything before this is prologue.",
      target_chapter: 2,
    },
    {
      order_index: 3,
      act: 1,
      beat_type: "three_act_plot_point_one",
      title: "First Plot Point",
      description:
        "Protagonist commits to the story goal. No turning back.",
      why_it_matters:
        "End of Act 1. The reader needs a clear door into the main conflict.",
      target_chapter: 4,
    },
    {
      order_index: 4,
      act: 2,
      beat_type: "three_act_rising_action",
      title: "Rising Action",
      description:
        "Escalating obstacles. Protagonist adapts — wins small, loses bigger.",
      why_it_matters:
        "The bulk of the book. Pace lives or dies in how each obstacle raises cost.",
      target_chapter: 7,
    },
    {
      order_index: 5,
      act: 2,
      beat_type: "three_act_midpoint",
      title: "Midpoint",
      description:
        "A reversal, revelation, or false victory that reframes the goal.",
      why_it_matters:
        "Splits Act 2 so it doesn't sag. Shifts from reactive to proactive.",
      target_chapter: 10,
    },
    {
      order_index: 6,
      act: 2,
      beat_type: "three_act_plot_point_two",
      title: "Second Plot Point",
      description:
        "Lowest point. The hero has the final piece of information and nothing else.",
      why_it_matters:
        "End of Act 2. Transitions from understanding to action.",
      target_chapter: 14,
    },
    {
      order_index: 7,
      act: 3,
      beat_type: "three_act_climax",
      title: "Climax",
      description:
        "Final confrontation. Internal change drives external resolution.",
      why_it_matters:
        "The emotional and structural payoff. Earn it — don't declare it.",
      target_chapter: 17,
    },
    {
      order_index: 8,
      act: 3,
      beat_type: "three_act_resolution",
      title: "Resolution",
      description:
        "New equilibrium. Show the changed world and the changed protagonist.",
      why_it_matters:
        "Readers need a beat after the climax to feel the win or loss settle.",
      target_chapter: 20,
    },
  ],
};

const SEVEN_POINT: PlotTemplate = {
  id: "seven_point",
  name: "Seven-Point Story",
  summary:
    "Dan Wells' plan-backward structure — work from resolution to hook so every point earns its place.",
  bestFor: "Plotter-leaning writers; mysteries, thrillers, series",
  beats: [
    {
      order_index: 1,
      act: 1,
      beat_type: "seven_point_hook",
      title: "Hook",
      description:
        "Starting state — the opposite of the resolution. Whatever the ending will be, start from its mirror.",
      why_it_matters:
        "Seven-point works because the hook and resolution rhyme. Start from where the change is greatest.",
      target_chapter: 1,
    },
    {
      order_index: 2,
      act: 1,
      beat_type: "seven_point_plot_turn_1",
      title: "Plot Turn 1",
      description:
        "The call that moves the hero out of the starting state. World changes; hero must react.",
      why_it_matters:
        "Begins the arc by forcing the hero into motion.",
      target_chapter: 3,
    },
    {
      order_index: 3,
      act: 2,
      beat_type: "seven_point_pinch_1",
      title: "Pinch 1",
      description:
        "Pressure arrives. An antagonistic force applies real cost — often off-screen villainy shown on-page.",
      why_it_matters:
        "Makes the hero act rather than drift. Reveals the antagonist's teeth.",
      target_chapter: 6,
    },
    {
      order_index: 4,
      act: 2,
      beat_type: "seven_point_midpoint",
      title: "Midpoint",
      description:
        "Hero shifts from reaction to action — makes a plan, accepts a truth, picks a side.",
      why_it_matters:
        "Agency flips here. Before: to the hero. After: from the hero.",
      target_chapter: 10,
    },
    {
      order_index: 5,
      act: 2,
      beat_type: "seven_point_pinch_2",
      title: "Pinch 2",
      description:
        "Plan falls apart. Often with a death, a betrayal, or a truth the hero refused to see.",
      why_it_matters:
        "Second pinch hurts more than the first because now the hero is committed.",
      target_chapter: 13,
    },
    {
      order_index: 6,
      act: 3,
      beat_type: "seven_point_plot_turn_2",
      title: "Plot Turn 2",
      description:
        "The last piece — insight, ally, item — that makes the resolution possible.",
      why_it_matters:
        "Hero goes into the climax with everything they need. No more hunting.",
      target_chapter: 16,
    },
    {
      order_index: 7,
      act: 3,
      beat_type: "seven_point_resolution",
      title: "Resolution",
      description:
        "The end state — opposite of the hook. Change made visible.",
      why_it_matters:
        "The mirror. Readers feel structural satisfaction from the rhyme.",
      target_chapter: 20,
    },
  ],
};

const HEROS_JOURNEY: PlotTemplate = {
  id: "heros_journey",
  name: "Hero's Journey",
  summary:
    "Campbell's monomyth, condensed to 12 stages. Mythic spine for quests, epics, coming-of-age.",
  bestFor: "Fantasy, epic, coming-of-age, transformation stories",
  beats: [
    {
      order_index: 1,
      act: 1,
      beat_type: "hj_ordinary_world",
      title: "Ordinary World",
      description:
        "The hero's normal life. Grounded, specific, textured with unmet need.",
      why_it_matters:
        "Contrast is the engine. The ordinary world tells us what the journey costs to leave.",
      target_chapter: 1,
    },
    {
      order_index: 2,
      act: 1,
      beat_type: "hj_call_to_adventure",
      title: "Call to Adventure",
      description:
        "An invitation, threat, or accident that opens a door to the other world.",
      why_it_matters:
        "The inciting event. Frames the stakes of saying yes.",
      target_chapter: 2,
    },
    {
      order_index: 3,
      act: 1,
      beat_type: "hj_refusal",
      title: "Refusal of the Call",
      description:
        "The hero hesitates — fear, duty, disbelief, cost.",
      why_it_matters:
        "Refusal proves the call is real. A hero who doesn't refuse hasn't noticed the stakes.",
      target_chapter: 3,
    },
    {
      order_index: 4,
      act: 1,
      beat_type: "hj_mentor",
      title: "Meeting the Mentor",
      description:
        "A figure — wise, strange, or flawed — gives the hero a tool, truth, or nudge.",
      why_it_matters:
        "Transfers the reader's trust to the hero. The mentor knows so we can believe.",
      target_chapter: 4,
    },
    {
      order_index: 5,
      act: 1,
      beat_type: "hj_crossing_threshold",
      title: "Crossing the Threshold",
      description:
        "Hero commits. Leaves the known world physically or psychologically.",
      why_it_matters:
        "Act 1 ends. Readers need the door slam to feel the journey begin.",
      target_chapter: 5,
    },
    {
      order_index: 6,
      act: 2,
      beat_type: "hj_tests_allies_enemies",
      title: "Tests, Allies, Enemies",
      description:
        "The hero learns the rules of the new world by failing and adapting.",
      why_it_matters:
        "Builds competence and relationships. The cast the finale will need.",
      target_chapter: 7,
    },
    {
      order_index: 7,
      act: 2,
      beat_type: "hj_approach",
      title: "Approach to the Inmost Cave",
      description:
        "Preparation — planning, gathering, steeling — for the central trial.",
      why_it_matters:
        "Raises stakes by making the danger legible. Makes the leap feel intentional.",
      target_chapter: 10,
    },
    {
      order_index: 8,
      act: 2,
      beat_type: "hj_ordeal",
      title: "Ordeal",
      description:
        "A death — literal or symbolic. The hero faces their deepest fear.",
      why_it_matters:
        "Midpoint turning. Whatever the hero was protecting, they must lose or transform.",
      target_chapter: 12,
    },
    {
      order_index: 9,
      act: 2,
      beat_type: "hj_reward",
      title: "Reward (Seizing the Sword)",
      description:
        "Hero survives and claims something — an object, knowledge, an oath.",
      why_it_matters:
        "Readers breathe. Proves transformation is possible — but the journey isn't over.",
      target_chapter: 14,
    },
    {
      order_index: 10,
      act: 3,
      beat_type: "hj_road_back",
      title: "The Road Back",
      description:
        "Hero commits to return. Often pursued — the old world doesn't let go easily.",
      why_it_matters:
        "Re-engages Act 1 stakes. The hero must now apply change to the world that birthed the wound.",
      target_chapter: 16,
    },
    {
      order_index: 11,
      act: 3,
      beat_type: "hj_resurrection",
      title: "Resurrection",
      description:
        "Final test. The hero proves change is permanent by passing a version of the original wound.",
      why_it_matters:
        "Climax. Internal and external threats resolve as one act.",
      target_chapter: 18,
    },
    {
      order_index: 12,
      act: 3,
      beat_type: "hj_return_with_elixir",
      title: "Return with the Elixir",
      description:
        "The hero comes home changed, bearing something that heals the ordinary world.",
      why_it_matters:
        "Closes the circle. Shows the journey mattered to more than the hero.",
      target_chapter: 20,
    },
  ],
};

const ROMANCE_BEAT_SHEET: PlotTemplate = {
  id: "romance_beat_sheet",
  name: "Romance Beat Sheet",
  summary:
    "Genre-accurate romance spine — meet, conflict, first kiss, midpoint, dark moment, grand gesture, HEA.",
  bestFor: "Contemporary romance, paranormal romance, romantasy, erotic romance",
  beats: [
    {
      order_index: 1,
      act: 1,
      beat_type: "romance_opening",
      title: "Opening / Introduction",
      description:
        "Introduce the protagonist in their world — wound, want, chemistry fingerprint.",
      why_it_matters:
        "Romance readers invest in a character before they invest in a couple. Earn that first.",
      target_chapter: 1,
    },
    {
      order_index: 2,
      act: 1,
      beat_type: "romance_meet",
      title: "Meet",
      description:
        "First encounter with the love interest — cute, hostile, or charged.",
      why_it_matters:
        "The genre promise lands here. Specific, sensory, and marked by something that can't be unfelt.",
      target_chapter: 1,
    },
    {
      order_index: 3,
      act: 1,
      beat_type: "romance_no_way",
      title: "No Way / Obstacle Named",
      description:
        "Why they can't be together — wound, ethics, class, species, stakes.",
      why_it_matters:
        "Attraction without obstacle is porn, not romance. Name the real cost of yes.",
      target_chapter: 2,
    },
    {
      order_index: 4,
      act: 1,
      beat_type: "romance_adhesion",
      title: "Adhesion",
      description:
        "A reason they can't walk away — forced proximity, shared goal, mutual need.",
      why_it_matters:
        "Keeps them in each other's orbit long enough for chemistry to do work.",
      target_chapter: 3,
    },
    {
      order_index: 5,
      act: 2,
      beat_type: "romance_first_kiss",
      title: "First Kiss / First Crossing",
      description:
        "The first line crossed — kiss, confession, shared secret. Point of no return.",
      why_it_matters:
        "The cover's promise. Slow it down; let the reader feel each millimeter.",
      target_chapter: 5,
    },
    {
      order_index: 6,
      act: 2,
      beat_type: "romance_fall_in_love",
      title: "Falling in Love",
      description:
        "Intimacy deepens — private jokes, admissions, rituals only they have.",
      why_it_matters:
        "Reader pleasure is watching the bond become specific. Generic intimacy reads flat.",
      target_chapter: 7,
    },
    {
      order_index: 7,
      act: 2,
      beat_type: "romance_midpoint",
      title: "Midpoint Shift",
      description:
        "A reveal, commitment, or external twist that raises the cost of the relationship.",
      why_it_matters:
        "Pivot from can we? to will we? The obstacle becomes internal.",
      target_chapter: 10,
    },
    {
      order_index: 8,
      act: 2,
      beat_type: "romance_false_high",
      title: "False High",
      description:
        "They believe they've won. A breath before the fall.",
      why_it_matters:
        "Contrast is the engine of the dark moment. Let them taste it first.",
      target_chapter: 12,
    },
    {
      order_index: 9,
      act: 2,
      beat_type: "romance_dark_moment",
      title: "Dark Moment / Breakup",
      description:
        "The relationship seems impossible — betrayal fear, exposed wound, incompatible needs.",
      why_it_matters:
        "Romance readers need to briefly doubt reunion. Sit in the ache one full beat.",
      target_chapter: 15,
    },
    {
      order_index: 10,
      act: 3,
      beat_type: "romance_grand_gesture",
      title: "Grand Gesture",
      description:
        "One of them chooses plainly — apology, sacrifice, crossing of the obstacle named earlier.",
      why_it_matters:
        "Agency earns the HEA. Grand doesn't mean loud; it means unmistakable.",
      target_chapter: 18,
    },
    {
      order_index: 11,
      act: 3,
      beat_type: "romance_reunion",
      title: "Reunion",
      description:
        "The meeting again — redefined, on new terms.",
      why_it_matters:
        "The emotional payoff. Earn the release by showing the change in both.",
      target_chapter: 19,
    },
    {
      order_index: 12,
      act: 3,
      beat_type: "romance_hea",
      title: "HEA / HFN",
      description:
        "Happily Ever After or Happy For Now — a future the reader can picture.",
      why_it_matters:
        "Genre contract. Close the arc, not just the bedroom door.",
      target_chapter: 20,
    },
  ],
};

export const PLOT_TEMPLATES: PlotTemplate[] = [
  SAVE_THE_CAT,
  THREE_ACT,
  SEVEN_POINT,
  HEROS_JOURNEY,
  ROMANCE_BEAT_SHEET,
];

export function getPlotTemplate(id: PlotTemplateId): PlotTemplate | undefined {
  return PLOT_TEMPLATES.find((t) => t.id === id);
}
