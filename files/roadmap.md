# Product roadmap — ideas backlog

Living document for directions we might build. **Nothing here is committed scope** until we pull it into `novella-app-architecture-v2.md` or an implementation plan.

**How to use:** Add ideas under the right status; note **problem**, **direction**, optional **trigger** (on save / button / chapter rollup). When something ships, move it to **Implemented** here (and into the architecture doc when you want it canonical).

---

## Implemented

*Shipped in the product today (this list should stay short and accurate).*

| # | Idea | Notes |
|---|------|--------|
| 1 | **Manuscript reader** — One place to read scenes in order, chapter-aware (`/manuscript`). | Book-like reading flow without hopping scene URLs. |
| 2 | **Role & species: dropdown + custom** — Presets aligned with onboarding/import plus **Other / custom** for uncommon labels. | Keeps summaries consistent; custom text still first-class. |

---

## Pending

*Numbered for reference; order is topical, not a strict build sequence.*

### Arc tracker & narrative intelligence

| # | Idea |
|---|------|
| 3 | **AI-assisted arc snapshot** — Claude reads scene prose + light context (POV, `@mentions`, world facts where cheap). Returns structured suggestions: what the reader can infer vs what only a character knows; hidden-nature / reveal-sensitive notes. **Approve / edit / discard** before persisting (same rhythm as Debrief / Fact Check). Open: trigger (manual “Analyze arc” vs autosave vs chapter rollup), scope (POV-first vs full cast), storage (merge into `scene_character_arcs` vs `pending_arc_suggestions`). Optional “pin to canon” when satisfied. |

**Current state:** Manual per-scene worksheet is a solid **ledger** after decisions; it feels empty until you type. Target: tracker feels like **insight**, not only data entry.

---

### Reader mode, export, polish (Phase 3 remainder)

Focus: **simplicity** and **seeing the book develop** — momentum and a tangible manuscript, not heavy tooling.

| # | Idea |
|---|------|
| 4 | **Export you can hold** — `.docx` or print-friendly PDF from the current manuscript. Artifact for you or a beta reader. |
| 5 | **Progress strip** — Dashboard or spine: total words, words this week, chapters with any draft vs empty, optional beat coverage. Simple numbers/states, not charts. |
| 6 | **“Where you are in the arc” without opening scenes** — Compact row per chapter or beat: scene count + word band + status (empty / drafting / done). Surfaces stored data at a glance. |
| 7 | **Share / reader link** — Read-only, book-like layout; optional secret URL. Pairs with export. |
| 8 | **Chapter read-through from the spine** — From chapter list or spine, open that chapter with **all scene prose stacked** in order (editing vs read-only TBD). Smaller slice than full manuscript view; faster to ship. |

---

### Story spine & scene flow

| # | Idea |
|---|------|
| 9 | **Suggest bridge beats** — After reordering beats or scenes: optional action to propose bridge beats or short transition prompts so time, location, and emotion line up (author reviews before changing prose). |

---

### World & characters

| # | Idea |
|---|------|
| 10 | **AI-assisted World & Character sheets** — Help **fill empty fields** to get started (from premise, style notes, pasted draft, or scenes) or **polish** what’s already written. Likely a dedicated action per card or section: **Partner**-style propose → you edit → save, or a **Profiler**-style pass for consistency with voice rules—exact persona TBD. Always author-approved; no silent overwrites. |

---

### Continuity & trust

| # | Idea |
|---|------|
| 11 | **Relationships + arc notes in Partner context** — Include active relationship rows (pair, type, current state, arc notes) in the universal `buildContext` block so Partner and inline assist honor ship dynamics, not only solo character sheets. |

---

### Collaboration & feedback

| # | Idea |
|---|------|
| 12 | *(Open — add items as they land.)* |

---

### Growth / multi-project / platform

| # | Idea |
|---|------|
| 13 | *(Open — add items as they land.)* |

---

## Parked

*Deferred, vague, or one-liners not ready to schedule.*

| # | Idea |
|---|------|
| P1 | **Tiny sparks** — Catch-all for small ideas until they graduate to **Pending**. |
