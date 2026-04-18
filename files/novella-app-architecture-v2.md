# Novella Writing App — Architecture & Build Plan (v2)

**For:** Paul's wife (primary user, solo) · **Built by:** Paul
**Genre:** Paranormal Romance · **Length:** ~30k novella
**Scope:** Personal tool, novice-friendly, opinionated-but-escapable

> v2 changes (vs. v1): promote scenes to first-class; reframe AI modes as five **personas**; add relationships/romance-arc module; make **import-existing-draft** the primary first-run; add **teach-as-you-go** layer; demote the worldbuilding wizard in favor of auto-extract + free text; add **session-continuity dashboard**; add **reader mode** with share-to-text; add **Paul's admin/staging separation**; replace OpenAI embeddings with **Voyage AI** so all AI is Anthropic (+ Voyage). Rewrote phases with a **Walking Skeleton** (Phase 0) that ships in days, not weeks.

---

## 1. Product summary

A guided writing studio for a paranormal romance novella. Built for a novice writer who needs structural support without being caged by it. Five AI "team members" with distinct specialties help her think, draft, edit, and research. The app is opinionated by default — every screen suggests a next move — but every suggestion has a "not now" or "skip."

**Design principles**
1. **Never stare at a blank page.** Every screen proposes a next action.
2. **Teach while working.** Every craft term has a plain-language explainer.
3. **Import first, don't wizard first.** She already has a draft — ingest it and let her keep writing.
4. **Scenes are the unit of work.** Chapters are containers.
5. **Opinionated by default, escapable always.** Suggestions can be skipped.
6. **Continuity over autonomy.** The AI never contradicts established facts.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind, shadcn/ui |
| Editor | TipTap (ProseMirror) |
| Backend | Next.js route handlers + Server Actions |
| Database | Supabase Postgres + pgvector |
| Auth | Supabase Auth (magic link, email allowlist) |
| AI — prose + craft | Anthropic Claude Sonnet 4.6 |
| AI — quick lookups | Anthropic Claude Haiku 4.5 |
| Embeddings (Phase 2) | Voyage AI (`voyage-3`) |
| Hosting | Vercel |
| SMS (reader mode) | Twilio or Vercel's built-in SMS option; simple signed URL as fallback |

All AI is Anthropic except embeddings (Voyage, Anthropic's recommended partner).

---

## 3. The Team — five AI personas

Every AI action in the app lets her pick a team member. Same underlying context injection; different specialty, temperature, and output style. Names are functional for now; onboarding offers a "name your team" step later.

| Persona | Specialty | Model | Temp | Output |
|---|---|---|---|---|
| **The Partner** | Co-writes prose in her voice | Sonnet 4.6 | 0.8 | 150–400 words of draft prose |
| **The Profiler** | Developmental coach — character, motivation, structure, pacing | Sonnet 4.6 | 0.4 | 3–6 targeted questions or bulleted feedback |
| **The Specialist** | Genre expert — PNR conventions, tropes, reader expectations | Sonnet 4.6 | 0.5 | Targeted genre-aware guidance |
| **The Proofreader** | Mechanical polish — typos, grammar, tense consistency | Sonnet 4.6 | 0.2 | Diff or cleaned version, voice preserved |
| **The Analyst** | Quick research — names, alternatives, lists, options | Haiku 4.5 | 0.9 | Short structured lists |

### 3.1 Persona guardrails (system-prompt rules)

- **The Partner** writes prose. Never explains; never lectures. Stays inside the POV character's head.
- **The Profiler** never writes prose. Asks questions, explains craft, names what's working. Frames feedback as "here's what I notice" + "here's why it matters."
- **The Specialist** never writes prose. Answers genre-specific questions. Cites convention only when the user asks "why" or "is this right for PNR."
- **The Proofreader** is explicitly forbidden from rewriting, restructuring, or changing word choice beyond mechanical fixes. Voice is sacred.
- **The Analyst** produces lists, names, alternatives. No prose, no explanation. Each item under 20 words.

### 3.2 Optional: name your team (onboarding step)

After import-first setup completes, offer: *"Would you like to give your team members names? You'll work with them a lot."* Save as `persona_aliases` on the project. Default to functional names if skipped.

---

## 4. Data model (Supabase)

Changes from v1: **scenes** promoted to first-class; **relationships** + **relationship_beats** added; **world_elements.metadata** simplified to free-text + optional typed fields (progressive disclosure); **open_threads** added; `persona_aliases` on projects.

```sql
-- Supabase Auth handles users.

create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null,
  premise text,
  subgenre text default 'paranormal_romance',
  paranormal_type text,
  heat_level text default 'steamy',
  target_wordcount int default 30000,
  style_notes text,
  persona_aliases jsonb default '{}', -- e.g. { "partner": "Sam", "profiler": "Dana" }
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  name text not null,
  role text,                      -- 'protagonist','love_interest','antagonist','supporting'
  species text,
  archetype text,
  appearance text,
  backstory text,
  wound text,
  desire text,
  need text,
  voice_notes text,
  powers text,
  aliases text[] default '{}',    -- for mention tracking
  created_at timestamptz default now()
);

create table relationships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  char_a_id uuid references characters on delete cascade,
  char_b_id uuid references characters on delete cascade,
  type text,                      -- 'romantic','rival','ally','family','other'
  current_state text,             -- short description, latest state
  arc_notes text,                 -- free-text arc direction
  created_at timestamptz default now()
);

-- A tracked beat in a relationship (e.g. "first real attraction", "refused the bond")
create table relationship_beats (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid references relationships on delete cascade,
  chapter_id uuid references chapters,
  scene_id uuid references scenes,
  beat_label text,                -- 'first_spark','first_touch','first_kiss','first_refusal','first_trust','first_vulnerability','bond','breakup','reunion'
  intensity int default 0,        -- -5..+5 for chemistry/tension curve
  notes text,
  created_at timestamptz default now()
);

create table world_elements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  category text,                  -- 'species','magic_rule','creature','faction','location','item','lore'
  name text,
  description text,               -- primary free-text; always required
  metadata jsonb default '{}',    -- optional typed fields; filled only when user opts in or auto-extract fills
  aliases text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table element_mentions (
  element_id uuid references world_elements on delete cascade,
  chapter_id uuid references chapters on delete cascade,
  scene_id uuid references scenes,
  mention_count int default 1,
  primary key (element_id, chapter_id)
);

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
  beat_type text,                 -- 'meet_cute','paranormal_reveal','midpoint','black_moment','grand_gesture','hea', etc.
  title text,
  description text,
  why_it_matters text,            -- teach-as-you-go explainer (seeded on create)
  target_chapter int,
  created_at timestamptz default now()
);

create table project_tropes (
  project_id uuid references projects on delete cascade,
  trope text,
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
  wordcount int default 0,       -- computed from sum of scene wordcounts
  status text default 'planned', -- 'planned','drafting','done'
  updated_at timestamptz default now()
);

-- NEW: scenes are first-class
create table scenes (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references chapters on delete cascade,
  order_index int,
  title text,                     -- optional short label; auto-generated if blank
  pov_character_id uuid references characters,
  beat_ids uuid[],                -- scenes can serve beats directly
  goal text,                      -- what the POV character wants in this scene
  conflict text,                  -- what's in the way
  outcome text,                   -- win / lose / win-but
  content text,                   -- prose
  wordcount int default 0,
  status text default 'planned',  -- 'planned','drafting','done'
  updated_at timestamptz default now()
);

-- Open narrative threads the app should surface later (from auto-extract and her own notes)
create table open_threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  question text,                  -- "What is Zoe?"
  opened_in_chapter_id uuid references chapters,
  opened_in_scene_id uuid references scenes,
  resolved boolean default false,
  resolved_in_chapter_id uuid references chapters,
  notes text,
  created_at timestamptz default now()
);

-- RAG store (Phase 2)
create table scene_chunks (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid references scenes on delete cascade,
  chunk_index int,
  content text,
  embedding vector(1024) -- voyage-3 dims
);
create index on scene_chunks using ivfflat (embedding vector_cosine_ops);

create table ai_interactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  persona text,                   -- 'partner','profiler','specialist','proofreader','analyst','extract','factcheck'
  context_type text,              -- 'scene','chapter','character','beat','freeform','dashboard'
  context_id uuid,
  prompt text,
  response text,
  model text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,4),
  created_at timestamptz default now()
);

-- Session continuity: what she was doing last time
create table sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  summary text,                   -- auto-generated "what you did today"
  last_scene_id uuid references scenes,
  last_action text,               -- 'drafting','planning','revising'
  ended_at timestamptz default now()
);

-- Reader mode shares
create table reader_shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  token text unique not null,     -- signed, guessable-proof
  scope text default 'latest_chapter', -- 'latest_chapter','chapter','full'
  scope_ref uuid,                 -- chapter_id if scope='chapter'
  expires_at timestamptz,
  created_at timestamptz default now()
);

-- RLS
alter table projects enable row level security;
create policy "own projects" on projects for all using (auth.uid() = user_id);
-- (repeat pattern for children via project_id)
-- reader_shares read policy gates on token in URL, server-validated.
```

---

## 5. Routes (App Router)

```
/                          → Dashboard / "coming back" screen
/onboarding                → Import first draft → review → done
/project/settings          → Voice samples, tropes, premise, persona aliases

/spine                     → Novel Spine (Act → Beat → Chapter → Scene tree)
/beats/[id]                → Beat detail + why-it-matters explainer + linked scenes

/characters                → List (protagonist, love interest, supporting)
/characters/[id]           → Character editor + AI panel
/relationships             → Relationship list + chemistry curve
/relationships/[id]        → Relationship editor + beat timeline

/world                     → World facts (grouped by category, free-text-first)
/world/[id]                → Element editor + mention timeline

/chapters                  → List with status chips
/chapters/[id]             → Chapter editor (scene cards + prose stream)
/scenes/[id]               → Single-scene focus mode

/freeform                  → Blank canvas escape hatch (Phase 3)

/share/[token]             → Reader mode (public via signed URL)
/admin                     → Paul-only (AI usage, cost, errors); feature-flagged
```

---

## 6. Universal system prompt template

Every AI call injects a **context block** + persona directive.

```
You are helping an author write a paranormal romance novella.

PROJECT
- Title: {title}
- Paranormal type: {paranormal_type}
- Heat level: {heat_level}
- Active tropes: {tropes}

VOICE
{style_notes or "Warm, immersive third-person, dual POV. Emotion forward."}
{matching_style_sample if applicable}

CHARACTERS IN SCOPE
{relevant_characters — compact: name, role, species, wound, voice_notes}

RELATIONSHIPS IN SCOPE
{relevant_relationships — who, type, current_state, recent beats}

WORLD FACTS IN SCOPE
{relevant_world_elements — name + description only}

OPEN THREADS (do not contradict; may pay off)
{open_threads where not resolved}

CURRENT BEAT
{beat_title}: {beat_description}
Why this beat matters: {why_it_matters}

CURRENT SCENE
Goal: {scene.goal}
Conflict: {scene.conflict}
Planned outcome: {scene.outcome}

PRIOR CONTEXT (Phase 2: RAG-retrieved top-k chunks from prior scenes)
{retrieved_chunks_or_last_scene_summary}

---

{PERSONA_DIRECTIVE}
```

### 6.1 Persona directives

**The Partner:**
> Write the next 200–350 words of prose, matching the voice above. Stay inside the POV character's head. Show behavior; don't narrate feelings. End on a beat that invites the author's next choice. Do not summarize. Do not narrate what's happening — be in the scene.

**The Profiler:**
> You are a gentle but sharp developmental coach. Do not write prose. Name one thing that's working and why. Then ask 3–5 targeted questions or give bulleted feedback that will sharpen what the author just wrote. Focus on tension, character motivation, POV discipline, and scene goals. When you reference a craft concept, explain it in one plain sentence.

**The Specialist:**
> You are a paranormal romance genre expert. Do not write prose. Answer the author's question with reference to PNR reader expectations and convention. When you cite a convention, name it and say why it works for readers. If the author's instinct diverges from convention, say so neutrally and name the trade-off.

**The Proofreader:**
> Fix only: typos, spelling, punctuation, grammar, tense consistency, dropped words, doubled words. Do NOT rewrite, restructure, change word choice, or adjust rhythm. If the author's usage is a style choice (fragments, sentence rhythm, deliberate repetition), leave it alone. Return the cleaned text AND a short bullet list of every change made.

**The Analyst:**
> Produce a short structured answer (list, alternatives, or single concrete suggestion). No prose. No explanation. Each item under 20 words.

---

## 7. PNR beat sheet (preload) + teach-as-you-go

Preloaded on project creation. Each beat carries a `why_it_matters` explainer shown in the beat detail view.

| # | Beat | Purpose | ~Chapter | Why it matters (shown to user) |
|---|---|---|---|---|
| 1 | Ordinary World | Heroine's life + a glimpse of the supernatural | 1 | Grounds the reader so the paranormal reveal hits harder. |
| 2 | Meet Cute | Couple collides, tension sparks | 1–2 | The reader's first hit of chemistry. Sets the emotional question for the whole book. |
| 3 | Paranormal Reveal | What he/she is, what the rules are | 2–3 | Readers want the rules early so they can feel stakes later. |
| 4 | Pull & Push | Attraction + the reason they can't | 3–4 | The engine of the middle. Without it, the middle sags. |
| 5 | First Kiss / Bond Moment | Point of no return | 5 | The promise the cover made. Pays off the pull. |
| 6 | Midpoint Escalation | Threat tightens, bond deepens | 6 | Stops the middle from sagging. Raises the stakes on both the plot and the romance simultaneously. |
| 7 | False Happy | They think they've won | 7 | Lets the reader breathe before the fall. The contrast makes the low point hurt. |
| 8 | Black Moment / Low Point | Worst fear realized | 8–9 | The emotional bottom. Everything the character feared comes true. |
| 9 | Grand Gesture | One fights for the other | 10 | Proves the love is active, not passive. |
| 10 | Climax | Paranormal threat defeated | 10–11 | The plot resolves. |
| 11 | HEA / HFN | Union, forever (or for now) | 11–12 | The genre contract. PNR readers will return the book if you skip this. |

### Default tropes offered at setup
Fated Mates · Enemies to Lovers · Forbidden Love · Protector · Bonded by Magic · Hidden Identity · Second Chance (Immortal) · Forced Proximity · Only One Bed

Each has a one-line "what readers expect" explainer on hover.

---

## 8. Worldbuilding — lightweight, auto-extract-first

v2 demotes the question-tree wizard. Free-text description is the primary interface. Typed fields are optional and progressively revealed.

### 8.1 Primary entry: auto-extract ("Debrief this chapter/scene")

Runs after a chapter or scene save. Same prompt shape as v1 §8.3 but fed at scene granularity too. Outputs a JSON review panel she approves/edits/discards. Approved items insert into `world_elements`, `characters`, or `open_threads`.

Import-first onboarding (§12) runs the same extraction on her pasted ch. 1. This is how the world bible populates without a wizard.

### 8.2 Manual entry: free-text cards

`/world` lists elements grouped by category. Each card:
- Name + free-text description (both editable inline)
- Optional "Add more detail" button that reveals typed metadata fields if she wants them
- Mention timeline (Phase 2): "First appeared ch. 1 · Last seen ch. 3 · 8 total mentions"
- "Ask The Analyst to expand" button

### 8.3 Optional wizard (Phase 2, low priority)

A stripped, skippable guided flow at `/world/build` for people who prefer structured onboarding. Not part of the default first-run. Sub-wizards (shifter, vampire, etc.) are **Phase 3 or later** — not needed for the novella she's writing since her shifter rules are already extracted.

### 8.4 Consistency check ("Fact Check"), Phase 2

On chapter save, a background Claude call compares the chapter against `world_elements` + `characters` and returns contradictions. Rendered as inline warnings: *"Possible contradiction with 'Mating bonds can be refused with no cost' (established ch. 1)."* She dismisses or fixes.

---

## 9. Novel Spine (structural navigation)

The spine is the primary navigation. Persistent tree showing **Act → Beat → Chapter → Scene**, always accessible. Desktop: left sidebar. Mobile: collapsible top drawer.

```
Act 1 — Setup  (~8k words target)
├─ Beat 1: Ordinary World           ✓ covered  · Ch. 1 · Sc. 1-2
├─ Beat 2: Meet Cute                ✓ covered  · Ch. 1 · Sc. 3
├─ Beat 3: Paranormal Reveal        ✓ covered  · Ch. 1 · Sc. 4-5
├─ Beat 4: Pull & Push              ◐ partial  · Ch. 1 Sc. 5, Ch. 2 planned

Act 2 — Confrontation  (~16k)
├─ Beat 5: First Kiss / Bond Moment ○ empty
...
```

Every node clickable. Beat → beat detail with why-it-matters + linked scenes. Chapter → chapter editor. Scene → scene focus mode.

### 9.1 Flexibility rules

- **Beats are editable.** Rename, reorder, merge, split. The preloaded PNR sheet is scaffolding.
- **M:N everywhere.** A scene can serve multiple beats; a beat can be covered across multiple scenes and chapters.
- **Scene-level reordering.** Drag scene cards within a chapter or between chapters.

### 9.2 Progress tracking (lives on the dashboard, §13)

- Wordcount: `sum(scenes.wordcount) / target_wordcount`
- Beats covered: count of beats with at least one linked scene
- Scenes by status: `planned / drafting / done`
- Current position: most recently updated scene
- Chemistry curve: relationship beat intensity plotted across chapters (Phase 2)

### 9.3 Next-action engine

Dashboard "What's next?" button runs a decision tree. Always returns a concrete step.

```
1. If any scene.status = 'drafting'
   → "Continue Scene N of Chapter M"   [opens scene focus]
2. Else if current beat has no scene with content
   → "Sketch the first scene for Beat N"   [creates scene, opens Profiler]
3. Else if next beat's POV character is missing wound/voice_notes
   → "Flesh out [character] before writing this beat"
4. Else if unapproved auto-extract suggestions exist
   → "Review N new world facts from Chapter X"
5. Else if open thread has aged >3 chapters without mention
   → "Open thread aging: '[question]'. Consider addressing or closing."
6. Else
   → "Start the next scene of Beat N"   [creates scene linked to beat]
```

---

## 10. Relationships & romance arc

PNR's engine is the romance, not the plot. Track it explicitly.

### 10.1 Relationship records

Created automatically for any pair that share a scene more than twice, or manually. Each relationship has:
- Type (romantic / rival / ally / family / other)
- Current state (one line, latest)
- Arc notes (free-text where she wants the relationship to go)

### 10.2 Relationship beats

A short list of classifiable moments with an intensity value (-5 to +5 for tension/chemistry direction):
`first_spark · first_touch · first_trust · first_kiss · first_vulnerability · first_refusal · bond · breakup · reunion · sacrifice · custom`

On scene save, a background Claude call (cheap Haiku, structured JSON) proposes relationship beats detected in the scene. She approves.

### 10.3 Chemistry curve (dashboard visualization)

A simple line chart: x = chapter order, y = intensity. Shows the shape of the romantic arc. For PNR, a good shape has steady rise, midpoint bump, steep drop at the Low Point, and a climb to HEA.

---

## 11. Chapter + scene writing surface

Desktop: three panels.

- **Left:** Novel Spine (collapsible)
- **Center:** Scene cards (collapsible summaries) + full prose stream
- **Right:** Team panel — persona picker + context chips (characters, beats, world facts in scope)

### 11.1 Two writing modes

- **Chapter view:** full prose of every scene in sequence, scene boundaries shown as dividers. Good for reading back, continuity, flow.
- **Scene focus view (`/scenes/[id]`):** one scene at a time, goal/conflict/outcome visible, zero distractions. Good for drafting.

### 11.2 Scene cards

Each scene is a card showing: POV · Goal · Conflict · Outcome · wordcount · status. Cards drag-reorder. Click expands to inline prose, or click "focus" to open full-screen scene view.

The scene template's goal/conflict/outcome fields are explained inline:

> **Goal** — what the POV character *wants* in this scene. Concrete, nameable.
> **Conflict** — what's in the way. Without conflict, a scene is just a beat report.
> **Outcome** — win / lose / win-but-at-a-cost. "Win-but" is usually the most interesting.

### 11.3 Inline selection actions

Highlight any text → Rewrite · Expand · Tighten · Describe · Change POV. Runs through the currently selected persona.

### 11.4 Continuity safety net (Phase 2)

Before The Partner runs, RAG query over `scene_chunks` (top 5 by cosine similarity to last 500 words + current scene fields). Injected into context.

### 11.5 Voice matching

Before The Partner runs, select the style sample whose label best matches the current scene (e.g. an "intimate" scene pulls the intimate sample). Injected into the voice block.

---

## 12. Import-first onboarding

The first-run flow. Replaces the guided world-builder wizard as the primary path.

```
Step 1: Welcome
  "Paste your first chapter or anything you've written so far.
   I'll read it and set up everything else for you."

Step 2: Paste box
  [large textarea] — accepts markdown, plain text

Step 3: Extraction (Claude call — ~30s, shown as progress)
  Extracts in one pass:
    - Characters (name, role, species, archetype, voice notes, powers)
    - World facts (species, magic rules, factions, locations, lore)
    - Scenes (split by --- or paragraph heuristics; fills goal/conflict/outcome)
    - Beats covered (which preloaded beats this chapter touches)
    - POV character per scene
    - Open threads (unresolved questions the prose raises)
    - Style sample proposal (the chapter's opening as the default 'opening' sample)
    - Premise + style notes (inferred one-paragraph premise + voice notes)

Step 4: Review screen
  Tabbed review: Characters · World · Scenes · Beats · Threads
  Each item: ✓ approve (default) · ✎ edit · ✗ discard
  "Approve all" button for fast path.

Step 5: Preferences
  - Tropes multi-select (with explainers)
  - Heat level
  - Target wordcount (default 30,000)
  - "Name your team?" (optional — save persona_aliases)

Step 6: Done
  → dashboard, with the spine populated and the dashboard showing
    "You have 1 chapter drafted. Here's what's next: Scene 1 of Chapter 2 — Pull & Push."
```

Fallback: she can skip import and do manual setup if she wants (just project title → blank spine with preloaded beats).

---

## 13. Dashboard — the "coming back" screen

This is where she lands when she opens the app. Designed to answer: *"Where was I, what's next, how am I doing?"*

### 13.1 Layout

**Top band — Story so far (auto-generated)**
Auto-updated AI summary (The Profiler, Haiku-tier): "Last session you drafted Scene 3 of Chapter 1, where Wyatt confronts Zoe about the scent. You opened a thread about Rustin's pack allegiance. Zoe's wound is still blank in her character sheet."

**Left — Where you are**
- Current chapter, current beat, current scene
- "Continue where you left off" primary button → opens last scene in focus mode
- Last session's notes (her own free-text "tomorrow I want to…" box from the end of the prior session)

**Center — What's next (next-action engine)**
Top 3 suggested actions from §9.3, each a single click.

**Right — Progress**
- Wordcount ring: X / 30k
- Beats covered: X / 11
- Scenes by status
- Chemistry curve (Phase 2)

**Bottom — Open threads**
A short list of unresolved questions the story has raised. Each can be addressed, deferred, or closed.

### 13.2 Warm-up prompts ("Stuck? Try this")

Context-aware starter prompts based on her current position:
- At a new scene: "Start with a sensory detail. What's the first thing [POV] notices?"
- Mid-scene: "What does [POV] most want right now that she isn't getting?"
- Mid-chapter: "What does the reader still not know that they're about to need?"

### 13.3 Session wrap

On app close (or a "Wrap up for today" button), The Profiler generates a two-sentence summary + appends to `sessions` table. Free-text box for her own note-to-self. Next session's "Story so far" is built from the last session summary + any saves since.

---

## 14. Teach-as-you-go layer

Every craft term has a plain-language explainer attached. Rendered as a hover popover (desktop) or tap sheet (mobile). Explainers are written in plain, procedural language — no writer-speak.

Examples:
- **Beat:** *A story waypoint — a moment the reader subconsciously expects. Skip it and the book feels "off" even if the reader can't say why.*
- **POV:** *Whose head the reader is in. Third-person deep means we only know what this one character knows, sees, and feels. Slipping into another character's thoughts mid-scene is usually a mistake.*
- **Trope:** *A pattern genre readers enjoy seeing again. Not a cliché — a promise.*
- **Show, don't tell:** *Describe what the character does, notices, or says. Don't announce what they feel. "Her hands shook as she reached for the cup" > "She was nervous."*
- **Low Point (Black Moment):** *The point in the story where everything the lead fears has come true. The reader should feel bad for a chapter before things turn.*
- **Voice:** *How the book sounds on the page. Sentence rhythm, word choice, what the narrator notices. Your voice is short-line, fragment-heavy, observational. The team preserves it.*
- **Fact Check:** *The app compares a chapter against established facts and flags contradictions. Dismiss if it's intentional.*
- **Debrief:** *The app reads the chapter you just wrote and proposes new world facts, characters, and threads to track. You approve before anything is saved.*

Explainers live in code (not the DB) so they can evolve without migrations.

---

## 15. Reader mode (share with Paul)

### 15.1 Share flow

From any chapter or scene: **Share with reader** → generates signed URL at `/share/[token]` + SMS to a preset number (Paul's). URL gives read-only view of the latest chapter (default scope) or the full book (optional). Expires in 7 days by default.

### 15.2 Reader view

Clean typography, chapter/scene navigation, no AI, no editing. Simple "what I think" response form → plain text back to her as a notification (optional Phase 3).

### 15.3 No collab

Deliberate: this is her solo workspace. Paul reads, not co-writes.

---

## 16. Paul's admin access & staging

Paul needs to develop/debug the app without touching her data.

### 16.1 Two Supabase projects

- `bab-prod` — her data. Paul's email is in the allowlist for auth but only to access `/admin`.
- `bab-staging` — dev/testing data. Paul's playground.

### 16.2 Two Vercel environments

- **Production** — connected to `bab-prod`, her domain (e.g., `write.[yourdomain]`).
- **Preview / staging** — every PR builds a preview against `bab-staging`.

### 16.3 Admin route

`/admin`, feature-flagged by email allowlist:
- AI cost per day / month
- Token usage by persona
- Error log (recent AI failures)
- Last session summary (read-only)
- No content editing — this is observability only.

### 16.4 Reader mode vs. admin — they're separate

Reader mode is how Paul *reads the book*. Admin is how Paul *maintains the app*. Don't conflate them.

---

## 17. Mobile

Primary device: MacBook. Secondary: her work phone.

- Spine becomes a top drawer; persona panel becomes a bottom sheet.
- Scene focus view is the preferred writing surface on mobile — one scene at a time.
- Inline selection actions collapse to a long-press menu.
- The Partner's output on mobile defaults to shorter chunks (100–200 words) to fit.
- Everything deploys to a PWA manifest so she can add-to-home-screen.

---

## 18. Phased build plan

Each phase deploys a working app. Phase 0 ships in days.

### Phase 0 — Walking Skeleton (Week 1, deployable Day 3–4)

**Goal:** She can paste her chapter 1 in, review what the app extracted, and keep writing chapter 2 with help from two team members.

**Ships:**
- Vercel project (prod + staging) + Supabase projects (prod + staging)
- Auth (magic link, email allowlist — just her email on prod, Paul on admin only)
- Schema migration 001: all tables above
- Seeded PNR beats (11 rows) on project creation
- **Import-first onboarding** (§12): paste ch. 1 → extract → review → save
- **Novel Spine** (read-only tree, Act → Beat → Chapter → Scene)
- **Chapter editor** with scene cards + TipTap prose stream
- **Scene focus mode**
- Team panel with **two personas only:** The Partner + The Profiler
- Flat context injection (no RAG, no consistency check)
- **Dashboard v1:** current position, word count, "Continue where you left off"
- `ai_interactions` logging
- PWA manifest
- Feature-flagged `/admin` showing AI cost + recent errors

**Deploy target:** usable app at her Vercel URL with Phase 0 scope by end of Week 1.

### Phase 1 — Full Team + Editable Spine (Week 2–3)

**Goal:** all five team members, editable structure, scene-level craft support, voice matching.

**Ships:**
- **The Specialist, The Proofreader, The Analyst** personas
- Editable beats (rename, reorder, merge, split)
- Drag-reorderable scene cards (within and across chapters)
- Characters CRUD with AI-assisted fields (wound, desire, need, voice notes)
- World elements manual CRUD (free-text-first) + Debrief / auto-extract review per chapter
- Style samples CRUD + voice-sample selection in Partner context
- Inline selection actions (Rewrite · Expand · Tighten · Describe · Change POV)
- **Teach-as-you-go layer:** hover explainers wired through all craft terms
- **Next-action engine** on dashboard
- **Story-so-far auto-summary** + session wrap
- Relationships list CRUD (no curve yet)
- Mobile responsive polish pass

**Deploy target:** stable v1 at end of Week 3.

### Phase 2 — Continuity, Relationships, RAG (Week 4)

**Goal:** AI stays continuity-safe; romance arc is visible; writing flow is smarter.

**Ships:**
- Voyage AI embeddings on scene save → `scene_chunks`
- RAG retrieval into Partner context
- **Fact Check** (consistency) on chapter save → inline warnings
- **Mention tracking** / paper trail across world elements and characters
- **Relationship beats** auto-proposed on scene save, she approves
- **Chemistry curve** visualization on dashboard
- Open thread aging + surfacing in next-action engine
- Warm-up prompts on dashboard
- Element tooltips in editor (TipTap decorations underline tracked names)

**Deploy target:** stable v2 at end of Week 4.

### Phase 3 — Reader Mode, Export, Polish (Week 5)

**Goal:** share with Paul; export; last rough edges.

**Ships:**
- **Reader mode** share links + SMS to Paul
- `.docx` export (`docx` npm package)
- Tense-drift specific sub-check in Proofreader (catches present-tense drift she mentions)
- Scene-level POV/beat tags (optional comment-marker syntax)
- Freeform canvas escape route
- "Name your team" onboarding step (optional; offered after 5 writing sessions)

**Deploy target:** complete v3 at end of Week 5.

### Later (post-novella)

- Arc Tracker (hidden-nature reveals, what reader knows vs. what character knows per chapter)
- Revision / diff mode with AI-suggested line edits
- Visual character/relationship graph
- Multi-project support (book 2)
- Optional structured world-builder wizard (for future users who prefer it)
- Published-PNR reference library (if sourced legally later)

---

## 19. Cost envelope

- **Vercel:** free tier likely sufficient; Pro ($20/mo) if preview traffic grows.
- **Supabase:** free tier to start; Pro ($25/mo) once pgvector usage justifies it.
- **Anthropic:** $15–40/mo during heavy drafting. Partner (Sonnet) is the main spend.
- **Voyage AI (Phase 2):** pennies at novella scale.
- **Twilio SMS (Phase 3):** $1–5/mo; or skip SMS and copy-link manually.

Budget display on dashboard (admin view) keeps this visible.

---

## 20. Cursor handoff prompt (Phase 0)

When Phase 0 build starts, open Cursor with this:

> Build the **Phase 0 Walking Skeleton** from `novella-app-architecture-v2.md`. Stack: Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui, Supabase (Postgres + Auth + RLS), TipTap, Anthropic SDK (Sonnet 4.6 for Partner + Profiler). Create two Supabase projects (`bab-prod`, `bab-staging`) and two Vercel environments. Write migration 001 with the full schema from §4. Seed the 11 PNR beats on project creation. The first vertical slice is the **import-first onboarding** (§12): paste box → extract via Claude Sonnet → review screen → save. Then Novel Spine (read-only tree), chapter/scene editor with TipTap, team panel with Partner + Profiler, flat context injection, dashboard v1, and `ai_interactions` logging. Don't skip RLS. Do not build The Specialist, Proofreader, or Analyst yet. Do not build RAG, Fact Check, mention tracking, or relationship beats — those are Phase 2.
