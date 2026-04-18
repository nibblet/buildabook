# Novella Writing App — Architecture & Build Plan

**For:** Paul's wife | **Genre:** Paranormal Romance | **Length:** ~30k novella | **Scope:** Personal tool

---

## 1. Product summary

A guided but escapable workspace for writing a paranormal romance novella with AI help. Three workspaces — Characters, Story, Chapters — with a per-action AI mode toggle (Co-write / Coach / Assist). Romance-native scaffolding (beats, tropes, dual POV) plus a worldbuilding layer specific to paranormal (magic rules, creature lore).

**Design principle:** Never stare at a blank page. Every screen has an AI action and a "skip" link.

---

## 2. Tech stack

- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind, shadcn/ui
- **Backend:** Next.js route handlers + Server Actions
- **DB/Auth:** Supabase (Postgres + pgvector + Auth + RLS)
- **AI:** Anthropic Claude Sonnet 4.6 (prose + coaching), Claude Haiku 4.5 (quick assists), OpenAI `text-embedding-3-small` for RAG
- **Hosting:** Vercel
- **Editor:** TipTap (ProseMirror) — clean writing surface, supports inline AI actions

---

## 3. Routes (App Router)

```
/                          → Dashboard (next-step guide, progress)
/project/new               → One-time setup wizard
/characters                → List (protagonist, love interest, supporting)
/characters/[id]           → Editor with AI panel
/characters/new            → Guided creation flow
/story                     → Overview (premise, tropes, heat level)
/story/world               → Magic system + creature lore (PNR-specific)
/story/beats               → Beat sheet editor
/chapters                  → List with status chips (planned/drafting/done)
/chapters/[id]             → Writing surface + AI panel
/freeform                  → Blank canvas escape hatch
/settings                  → Style samples, voice preferences
```

---

## 4. Data model (Supabase)

```sql
-- Supabase Auth handles users

create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null,
  premise text,
  subgenre text default 'paranormal_romance',
  paranormal_type text,           -- 'vampire','shifter','witch','fae','ghost','demon','angel','psychic','other'
  heat_level text default 'steamy', -- 'sweet','sensual','steamy','explicit'
  target_wordcount int default 30000,
  style_notes text,               -- voice direction for AI
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  name text not null,
  role text,                      -- 'protagonist','love_interest','antagonist','supporting'
  species text,                   -- 'human','vampire','shifter','witch','fae','demon','other'
  archetype text,                 -- 'grumpy','sunshine','alpha','cinnamon_roll','bad_boy','ice_queen', etc.
  appearance text,
  backstory text,
  wound text,                     -- emotional wound (what hurts them)
  desire text,                    -- what they want
  need text,                      -- what they actually need
  voice_notes text,               -- how they speak
  powers text,                    -- paranormal abilities / limits
  created_at timestamptz default now()
);

create table world_elements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  category text,                  -- 'species','magic_rule','creature','faction','location','item','lore'
  name text,
  description text,
  metadata jsonb default '{}',    -- shape varies by category (see section 8)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tracks which chapters reference which world elements
create table element_mentions (
  element_id uuid references world_elements on delete cascade,
  chapter_id uuid references chapters on delete cascade,
  mention_count int default 1,
  primary key (element_id, chapter_id)
);

-- Style samples for voice matching (injected into Co-write prompts)
create table style_samples (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  label text,                     -- 'opening','action','dialogue','introspection','intimate'
  content text,
  is_default bool default false,
  created_at timestamptz default now()
);

create table beats (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  order_index int,
  act int,                        -- 1, 2, 3
  beat_type text,                 -- 'meet_cute','spark','midpoint','black_moment','grand_gesture','hea'
  title text,
  description text,
  target_chapter int,
  created_at timestamptz default now()
);

create table project_tropes (
  project_id uuid references projects on delete cascade,
  trope text,                     -- 'fated_mates','enemies_to_lovers','forbidden_love', etc.
  primary key (project_id, trope)
);

create table chapters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  order_index int,
  title text,
  pov_character_id uuid references characters,
  synopsis text,
  beat_ids uuid[],
  content text,
  wordcount int default 0,
  status text default 'planned',  -- 'planned','drafting','done'
  updated_at timestamptz default now()
);

-- RAG: chunk prior chapters for continuity retrieval
create table chapter_chunks (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references chapters on delete cascade,
  chunk_index int,
  content text,
  embedding vector(1536)
);
create index on chapter_chunks using ivfflat (embedding vector_cosine_ops);

create table ai_interactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  context_type text,              -- 'character','beat','chapter','freeform'
  context_id uuid,
  mode text,                      -- 'cowrite','coach','assist'
  prompt text,
  response text,
  model text,
  tokens_used int,
  created_at timestamptz default now()
);

-- RLS (personal tool but good hygiene)
alter table projects enable row level security;
create policy "own projects" on projects for all using (auth.uid() = user_id);
-- (repeat pattern for children via project_id)
```

---

## 5. AI modes — how the toggle works

Every AI action in the app shows three buttons. Same context injection, different system prompt and output style.

### Co-write
- **Purpose:** Generate prose in her voice.
- **Model:** Claude Sonnet 4.6, temp 0.8.
- **Output:** 100–400 words of draft prose.
- **Trigger phrases in UI:** "Continue the scene," "Write from his POV," "Draft this beat."

### Coach
- **Purpose:** Ask questions, give feedback. Never write prose.
- **Model:** Claude Sonnet 4.6, temp 0.4.
- **Output:** 3–5 targeted questions or bullet feedback.
- **Trigger phrases:** "Is the tension working?" "What's missing?" "Critique this chapter."

### Assist
- **Purpose:** Quick structured outputs on demand.
- **Model:** Claude Haiku 4.5, temp 0.9.
- **Output:** Lists, alternatives, names, descriptions.
- **Trigger phrases:** "5 ways to describe this kiss," "Name a vampire coven," "Alternative phrasings."

### Polish
- **Purpose:** Copyedit only. Fix mechanics without touching voice.
- **Model:** Claude Sonnet 4.6, temp 0.2.
- **Output:** Diff or clean version with typos, grammar, tense consistency, and dropped words fixed.
- **Trigger phrases:** "Polish this chapter," "Fix mechanics."
- **Guardrail:** System prompt explicitly forbids rewriting, restructuring, or changing word choice beyond mechanical fixes. "If it's her style choice, leave it alone."

---

## 6. Universal system prompt template

Every AI call injects a **context block** + mode-specific directive.

```
You are helping an author write a paranormal romance novella.

PROJECT
- Title: {title}
- Paranormal type: {paranormal_type}
- Heat level: {heat_level}
- Active tropes: {tropes}

VOICE
{style_notes or "Warm, immersive third-person, dual POV. Emotion forward."}

CHARACTERS IN SCOPE
{relevant_characters as compact block — name, role, species, wound, voice_notes}

WORLD RULES IN SCOPE
{relevant_world_elements}

CURRENT BEAT
{beat_title}: {beat_description}

PRIOR CONTEXT (most recent, retrieved via RAG)
{last_chapter_summary + top-k retrieved chunks}

---

{MODE_DIRECTIVE}
```

### Mode directives

**Co-write:**
> Write the next 200–350 words of prose, matching the voice above. Stay inside the POV character's head. Show, don't tell. End on a beat that invites the author's next choice. Do not summarize. Do not narrate what's happening — be in the scene.

**Coach:**
> You are a gentle but sharp writing coach. Do not write prose. Ask 3–5 questions or give bulleted feedback that will sharpen what the author just wrote. Focus on tension, character truth, and genre conventions for paranormal romance.

**Assist:**
> Produce a short structured answer (list, alternatives, or single concrete suggestion). No prose, no explanation. Keep each item under 20 words.

---

## 7. Paranormal romance novella beat sheet (preload)

Preload this as the default beat structure on project creation. ~10–12 chapters at 2.5–3k words each.

| # | Beat | Purpose | ~Chapter |
|---|------|---------|----------|
| 1 | Ordinary World | Heroine's life + a glimpse of the supernatural | 1 |
| 2 | Meet Cute | Couple collides, tension sparks | 1–2 |
| 3 | Paranormal Reveal | What he/she is, what the rules are | 2–3 |
| 4 | Pull & Push | Attraction + the reason they can't | 3–4 |
| 5 | First Kiss / Bond Moment | Point of no return | 5 |
| 6 | Midpoint Escalation | Threat tightens, bond deepens | 6 |
| 7 | False Happy | They think they've won | 7 |
| 8 | Black Moment | Worst fear realized — breakup, betrayal, death-fake-out | 8–9 |
| 9 | Grand Gesture | One fights for the other | 10 |
| 10 | Climax | Paranormal threat defeated | 10–11 |
| 11 | HEA / HFN | Union, forever (or for now) | 11–12 |

### Default tropes to offer at setup (pick 1–3)
Fated Mates · Enemies to Lovers · Forbidden Love · Protector · Bonded by Magic · Hidden Identity · Second Chance (Immortal) · Forced Proximity · Only One Bed

---

## 8. Worldbuilding module — the core of a paranormal app

This is what separates this app from a generic romance tool. Three layered capabilities work together.

### 8.1 Guided World Builder (wizard)

A conditional flow accessible at `/story/world/build`, also triggered the first time she enters the worldbuilding area. PNR-specific question tree — picking "shifters" opens a shifter sub-wizard; "vampires" opens a different one. Multi-select at the top level means she can have multiple species in the same world.

**Top-level questions:**
1. Which supernatural beings exist? (multi-select: shifters, vampires, witches, fae, demons, angels, ghosts, psychics, other/custom)
2. Masquerade or open world? (humans unaware / partially aware / openly coexisting)
3. Does magic have a cost? (every power has a price — mana, physical toll, emotional, bond-based, none)
4. Antagonist force for this novella? (rival faction, hunter organization, ancient curse, internal politics, external war)
5. Heroine's place in the world? (known insider, known outsider, hidden insider, hidden-nature mystery)

**Shifter sub-wizard (triggered if shifters selected):**
- Pack hierarchy: alpha / beta / omega? Ranks and meaning?
- Mating bonds: exist? How do they form? Can they be refused? What's the cost?
- Turning: born or made? Both? Process?
- Classic weaknesses: silver, wolfsbane, moon phases, none of the above?
- Multi-species interaction: how do shifters relate to other species in your world?

Each question has a **"Help me decide"** button that runs Assist mode and proposes 3 options she can pick, edit, or ignore. At the end, the wizard writes structured rows into `world_elements` with populated `metadata`. She can revisit and refine any element later.

### 8.2 Element Tracker (living codex)

The worldbuilding list page (`/story/world`) shows elements grouped by category, each card showing:
- Name + one-line description
- Typed metadata fields (see shapes below)
- Mention timeline: "First appeared ch. 1 · Last seen ch. 5 · 8 total mentions"
- Edit and "Ask AI to expand" buttons

**Metadata shapes per category (JSON stored in `world_elements.metadata`):**

```ts
type ElementMetadata =
  | { category: 'species'; powers: string[]; weaknesses: string[]; lifespan: string; origin: string }
  | { category: 'magic_rule'; rule: string; cost: string; limits: string; known_by: string }
  | { category: 'creature'; species_ref: string; traits: string[]; notable_individuals: string[] }
  | { category: 'faction'; members: string[]; agenda: string; alliances: string[]; rivals: string[] }
  | { category: 'location'; description: string; significance: string; inhabitants: string[] }
  | { category: 'item'; description: string; powers: string; origin: string; holder: string }
  | { category: 'lore'; description: string; who_knows: string; era: string };
```

**Mention tracking (populated on chapter save):**
After a chapter is saved, a background job scans `content` for element names (simple case-insensitive match, plus common aliases from an `aliases text[]` field if we add it) and upserts rows into `element_mentions`. That powers the "first seen / last seen / total" display.

### 8.3 Auto-extract from chapters

Every chapter page has an **Extract worldbuilding** button. Runs this Claude call:

```
You are analyzing a paranormal romance chapter for worldbuilding continuity.

EXISTING WORLD ELEMENTS (do not re-propose these):
{json of existing world_elements with category + name}

EXISTING CHARACTERS:
{json of existing characters with name + role}

CHAPTER CONTENT:
{chapter.content}

Identify NEW worldbuilding elements introduced in this chapter that should be tracked. Categories: species, magic_rule, creature, faction, location, item, lore, character.

Return ONLY a JSON array. No prose. Each item:
{
  "category": "...",
  "name": "...",
  "description": "one-line summary grounded in chapter evidence",
  "quoted_evidence": "short phrase from chapter proving this element exists",
  "confidence": "low" | "medium" | "high"
}
```

Response is parsed and rendered as a review panel: checkboxes for approve / edit / discard per item. Approved items insert into `world_elements` (or `characters`). For her chapter 1, this should surface The Nest, Pack Holdings Group, Hurstborne lineage, the living land concept, were-species plural, scent-based ID, and Zoe's fire-with-intent power.

### 8.4 Consistency check (Phase 3)

On chapter save, a background Claude call compares the chapter against existing `world_elements` + `characters` and returns any contradictions. Renders as inline warnings in the chapter list: "Possible contradiction with element 'Silver burns shifters' (ch. 3)." She can dismiss or fix.

```
Given these established facts about the world and characters, does the chapter below contradict any of them? Be strict but avoid false positives — only flag genuine contradictions, not ambiguities.

FACTS:
{world_elements + characters}

CHAPTER:
{chapter.content}

Return a JSON array of contradictions, each with:
{ "element_name": "...", "expected": "...", "actual": "...", "chapter_quote": "..." }

Empty array if no contradictions.
```

---

## 9. The Novel Spine (structural navigation)

The spine is the primary navigation for the whole app — a persistent tree showing Act → Beat → Chapter, always accessible. Desktop: left sidebar. Mobile: collapsible top drawer.

```
Act 1 — Setup  (~8k words target)
├─ Beat 1: Ordinary World           ✓ covered  · Ch. 1
├─ Beat 2: Meet Cute                ✓ covered  · Ch. 1
├─ Beat 3: Paranormal Reveal        · planned  · Ch. 2
├─ Beat 4: Pull & Push              ○ empty    · Ch. 3

Act 2 — Confrontation  (~16k)
├─ Beat 5: First Kiss / Bond Moment ○ empty
...

Act 3 — Resolution  (~6k)
├─ Beat 10: Climax                  ○ empty
├─ Beat 11: HEA                     ○ empty
```

Every node is clickable. Beat → opens that beat's detail view with linked chapters and a "write synopsis" action. Chapter → opens the editor. She never hunts between screens.

### 9.1 Flexible structure (not a cage)

Two rules preserve discovery:

- **Beats are editable.** Rename, reorder, merge, split. If her "Paranormal Reveal" needs to become two beats, she splits it; the spine updates live. The preloaded PNR beat sheet is scaffolding, not contract.
- **Many-to-many chapter ↔ beat.** A chapter can cover multiple beats (her ch. 1 hits 1–4). A beat can span multiple chapters. The spine reflects this honestly — beats show "covered by ch. 1" and chapters list all beats they serve.

### 9.2 Progress tracking (dashboard)

Always visible on the dashboard, computed from existing fields:

- **Wordcount:** `sum(chapters.wordcount) / projects.target_wordcount` → "6,200 / 30,000 (21%)"
- **Beats covered:** count of beats where at least one chapter lists the beat in `beat_ids` → "4 / 11 (36%)"
- **Chapters by status:** `group by chapters.status` → "1 drafting · 0 done · 11 remaining"
- **Current position:** chapter with most recent `updated_at` → "Beat 3 — Paranormal Reveal (Ch. 2)"

### 9.3 Next-action engine

The dashboard's "What's next?" button runs a simple decision tree against current state. Always returns a concrete next step — never empty.

```
1. If any chapter.status = 'drafting'
   → "Continue chapter N"   [opens editor]

2. Else if next uncovered beat has no synopsis (beat.description is null)
   → "Sketch beat N in 2 lines"   [opens beat editor in Coach mode]

3. Else if next beat's POV character is missing wound/voice_notes
   → "Flesh out [character] before writing this beat"

4. Else if unapproved auto-extract suggestions exist
   → "Review N new worldbuilding suggestions from ch. X"

5. Else
   → "Start chapter N for beat M"   [creates new chapter linked to beat]
```

### 9.4 Scene-level awareness (lightweight)

She already writes with `---` scene breaks. The editor renders them as visual dividers and lets her optionally tag each section with POV character + beat via a comment marker:

```
<!-- scene pov="Zoe" beat="meet_cute" -->

The clearing opened ahead.
Zoe slowed the truck.
...
```

Parsed on render; ignored if absent. No separate `scenes` table — avoids Scrivener-style org paralysis. For a novella, chapter-level granularity plus optional scene tags is the right depth.

---

## 10. Chapter writing surface

Three-panel layout on desktop, stacked on mobile.

- **Left:** Chapter list / outline
- **Center:** TipTap editor (her prose)
- **Right:** AI panel with mode toggle + context chips (which characters, which beat, which world rules are in scope — she can toggle them)

Inline actions on selected text: **Rewrite · Expand · Describe · Tighten · Change POV**. Each runs through the mode she has selected.

**Continuity safety net:** Before Co-write runs, do a RAG query over `chapter_chunks` (top 5 by cosine similarity to the last 500 words she wrote) and inject into context. This is how the AI stops contradicting earlier chapters.

---

## 11. Phased build order

### Phase 1 — MVP writing flow + Novel Spine (week 1–2)
Goal: she can see her whole novella as a structured spine and write chapter 1 with AI help in her voice.
- Supabase project + schema + RLS
- Auth (magic link, just her email whitelisted)
- Project creation wizard → creates project + preloaded beats (with `act` values set for all 11)
- **Novel Spine navigation** (section 9) — sidebar on desktop, drawer on mobile, clickable tree
- **Dashboard with progress tracking** (section 9.2) — wordcount, beats covered, chapters by status, current position
- **Guided World Builder wizard** (section 8.1) — runs after project creation, populates world_elements with metadata
- Characters CRUD with AI-assisted fields (backstory, wound, voice)
- **Style Samples CRUD** — she uploads 2–3 of her existing excerpts, labels them (opening / action / dialogue / introspection)
- World elements list page with typed metadata editors
- Beat editor — synopsis, target chapter, notes; rename/reorder/merge/split
- Chapter editor (TipTap) with the three-mode AI panel — Co-write prompt injects matching style sample
- Simple context injection: all characters + all world_elements + current beat (no RAG yet)

### Phase 2 — Extraction, polish, continuity (week 3)
- **Next-action engine** (section 9.3) — rule-based "What's next?" on dashboard
- **Auto-extract worldbuilding** from chapters (section 8.3)
- **Auto-extract characters** from chapters (same pattern)
- **Polish mode** (4th AI mode) — copyeditor that fixes typos, grammar, tense slips; never touches voice
- Element mention tracking — background scan on chapter save, populates `element_mentions`
- Chunk + embed chapters on save for RAG retrieval
- RAG retrieval in Co-write context (top-k prior chunks)

### Phase 3 — Consistency & polish (week 4)
- **Consistency check** on chapter save (section 8.4)
- In-editor element tooltips (TipTap decorations — underline tracked names, hover shows summary)
- Scene-break parsing + optional POV/beat tags per scene (section 9.4)
- Export to `.docx` (use `docx` npm package)
- Freeform canvas route

### Later, if she wants it
- Arc Tracker (hidden-nature reveals, what reader knows vs. what character knows per chapter)
- Revision mode (diff view, AI-suggested line edits)
- Character relationship graph
- Multi-project support (book 2)

---

## 12. Cost envelope (personal use)

- Vercel: free tier fine
- Supabase: free tier → Pro ($25/mo) if pgvector usage grows
- Anthropic: budget ~$10–30/mo for heavy writing sessions (Sonnet co-write is the main cost)
- OpenAI embeddings: pennies

---

## 13. Cursor handoff prompt

When you start in Cursor, open with this:

> Build a Next.js 15 App Router app using the attached architecture doc. Start with Phase 1. Stack: TypeScript, Tailwind, shadcn/ui, Supabase, TipTap, Anthropic SDK. Set up the Supabase schema first (migrations in `/supabase/migrations`), then scaffold routes, then build the character editor with the three-mode AI panel as the first vertical slice. Use Server Actions for AI calls. Don't skip RLS.
