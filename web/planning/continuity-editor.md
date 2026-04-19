# Continuity Editor — Implementation Plan

> **Goal:** Make the app work for a discovery-first writer. As scenes are written, the system silently extracts and maintains a structured "world model" (characters, world, relationships, events, rules) and surfaces continuity issues in the margin gutter without breaking flow. An end-of-chapter "Codex Review" lets the author batch-confirm what was learned. The same model feeds the AI on every subsequent generation so the assistant gets smarter about *her* world the more she writes.

## 1. Decisions Locked In (from brainstorm)


| Decision           | Choice                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Scene boundaries   | Use existing `scenes` table — extraction unit is one scene                                               |
| Extraction trigger | On scene save (post-save pipeline, async)                                                                |
| Annotation surface | Margin gutter — works in both 3-pane scene view and focused full-page view                               |
| Confidence         | LLM self-reported (`low                                                                                  |
| Persona            | "Continuity Editor"                                                                                      |
| Audience           | Discovery-first writer (no upfront canon required); architect-style users (Option 3 Seed Canon) deferred |
| Plan depth         | Standard, single-file plan                                                                               |


## 2. Existing Foundations We Build On

The codebase already has most of the plumbing — we are mostly *extending* an existing pipeline, not building a new one.

- **Post-save scene pipeline:** `web/src/lib/ai/post-save-scene.ts` already runs async after every scene save (`firePostSaveScenePipeline`). New extraction step plugs in here.
- **AI extraction precedent:** `web/src/lib/ai/extract.ts` shows the pattern for grounded JSON extraction with Zod schemas, paragraph-indexed prose, and `jsonrepair` fallback. We mirror this.
- **AI call surface:** `askModel` (`web/src/lib/ai/model.ts`) → `askClaude` / `askGrok`, already logs to `ai_interactions`.
- **Embeddings + RAG:** `scene_chunks`, `voyageEmbed`, `match_scene_chunks` RPC, `retrieveRagContinuity` (`web/src/lib/ai/rag.ts`). Used for relevance scoring of claims later.
- **Existing structured stores:** `characters`, `world_elements`, `relationships`, `relationship_beats`, `open_threads`, `character_mentions`, `element_mentions`, `chapters.fact_check_warnings`. We do **not** replace these — claims either link to or are promoted into them.
- **Chapter-level review precedent:** `chapter-toolbar.tsx` + `chapter-fact-check.ts` + `chapter-debrief.ts` are the model for the new "Codex Review" screen.
- **Scene editor:** TipTap 3 in `web/src/components/prose-editor.tsx`. Currently no decorations; we will add a `ContinuityAnnotations` extension and a sibling gutter component.
- **Scene shell:** `web/src/app/(app)/scenes/[id]/scene-focus-client.tsx` controls both 3-pane and focus layouts via `use-focus-mode.ts`. Gutter must integrate with both.
- **Multi-tenancy:** All new tables follow the existing RLS pattern (`projects.user_id` via join policies — see `0001_init.sql`).

## 3. The Core Model: Claims

The unifying primitive is a **claim** — a single atomic, source-cited fact extracted from prose.

A claim is intentionally *smaller* than a `character` row or a `world_element` row. A character has many claims about it. Claims are the audit trail; the existing tables are the canonicalized rollup.

### 3.1 Claim shape (conceptual)


| Field                                            | Purpose                                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `id`                                             | uuid                                                                                                             |
| `project_id`                                     | RLS scope                                                                                                        |
| `source_scene_id`                                | scene the claim was extracted from                                                                               |
| `source_paragraph_start`, `source_paragraph_end` | citation back to prose                                                                                           |
| `kind`                                           | `attribute                                                                                                       |
| `subject_type`                                   | `character                                                                                                       |
| `subject_ref`                                    | foreign key into the appropriate table when known                                                                |
| `subject_label`                                  | string fallback when `subject_ref` is null (e.g. "Lyra" before the character row exists)                         |
| `predicate`                                      | short verb-phrase normalized by extractor (e.g. `has_trait`, `fears`, `located_in`, `distrusts`, `died`, `rule`) |
| `object_text`                                    | the value/description ("a fear of water", "Marcus", "left-handed")                                               |
| `confidence`                                     | `low                                                                                                             |
| `status`                                         | `auto                                                                                                            |
| `superseded_by`                                  | nullable claim id                                                                                                |
| `created_at`, `updated_at`                       |                                                                                                                  |
| `tier`                                           | `A                                                                                                               |
| `extractor_version`                              | int — re-extract gating                                                                                          |


### 3.2 Why a separate claims table instead of just writing into existing tables?

1. **Reversibility.** Auto-extraction will be wrong sometimes. Claims can be rejected or superseded without destroying canonical rows.
2. **Citations.** Every claim has a scene + paragraph range, so the wiki can show "where did we learn this?"
3. **Confidence layering.** AI generation can weight `confirmed` higher than `auto` without losing the auto signal.
4. **Diff-friendly.** The Codex Review screen is just "show me claims with `status='auto'` since chapter X."
5. **Promotion path.** A confirmed character claim can `UPDATE characters SET …` and mark itself `status='confirmed'`. The existing UI keeps working unchanged.

### 3.3 Companion table: `continuity_annotations`

Annotations are *derived from* claims (or from contradiction checks) and represent something the editor *might* show in the gutter. Separate table because:

- Same claim can yield zero or one annotation depending on tier rules.
- Annotations have their own lifecycle (`pending | shown | dismissed | resolved`).
- Dismissal must persist across reloads.


| Field                    | Purpose                                                 |
| ------------------------ | ------------------------------------------------------- |
| `id`                     | uuid                                                    |
| `project_id`, `scene_id` | scope                                                   |
| `paragraph_index`        | which paragraph in the scene the gutter dot attaches to |
| `tier`                   | `A                                                      |
| `kind`                   | `contradiction                                          |
| `summary`                | one-line for the gutter tooltip                         |
| `detail`                 | longer markdown for the side panel                      |
| `claim_ids`              | array — supporting claims                               |
| `conflicting_claim_ids`  | array — for contradictions                              |
| `status`                 | `pending                                                |
| `dismissed_session_id`   | so "dismissed once this session" is cheap               |
| `created_at`             |                                                         |


## 4. Architecture Overview

```
                                 scene save (existing autosave)
                                          │
                                          ▼
                          firePostSaveScenePipeline (existing)
                                          │
                          ┌───────────────┼────────────────────┐
                          │               │                    │
                  rebuildSceneChunks  recountMentions   ★ extractContinuity (NEW)
                          │                                    │
                          │                                    ├─► insert claims
                          │                                    ├─► run contradiction checks
                          │                                    ├─► generate annotations (tiered)
                          │                                    └─► update auto-wiki views

  ┌────────────────────────── reads ──────────────────────────────┐
  │                                                               │
  ▼                                                               ▼
TipTap editor + ContinuityGutter                          Codex Review screen
  - subscribes to annotations for current scene             (chapter-level)
  - debounced surfacing per tier rules                     - groups claims since last review
  - dismiss / open detail                                   - bulk accept / reject / edit

                                    ▲
                                    │
                       AI generation (askPersona / context.ts)
                       - injects confirmed claims (full weight)
                       - injects auto claims (lower weight, marked tentative)
                       - injects last N scenes verbatim
                       - tells model: "prefer her tentative facts over invention,
                         do not contradict confirmed canon"
```

## 5. The Extraction Pipeline

### 5.1 Trigger

In `web/src/lib/ai/post-save-scene.ts`, add a new step `extractContinuity(sceneId)` after `rebuildSceneChunks`. It runs in the same fire-and-forget IIFE — failures must not affect autosave.

### 5.2 Idempotency & re-extraction

- Each scene save bumps a `scenes.continuity_extracted_at` timestamp and stores the `content_hash` we extracted from.
- `extractContinuity` is a no-op if the current scene `content_hash` matches the last extracted hash and `extractor_version` is unchanged.
- When content changes, we **do not delete** existing claims for that scene. We mark them `superseded` and create new ones. This preserves Codex Review history. (Trade-off: storage grows; acceptable given prose volumes are small.)

### 5.3 Prompt design (Continuity Editor persona)

A new persona `continuity_editor` in `web/src/lib/ai/personas.ts`. System prompt summary:

> You are the **Continuity Editor**, a silent assistant who reads each scene as the author writes it. Your job is to extract atomic, grounded facts into a structured claims list so the world model stays consistent. Be conservative: every claim must be directly supported by the prose. Prefer "no claim" over a guess. Self-report confidence: `high` if the prose states it explicitly, `medium` if strongly implied, `low` if inferred from subtext. Return ONLY valid JSON.

User prompt structure (mirrors `extract.ts` paragraph indexing):

1. Numbered paragraphs of the **current scene**.
2. A compact "what we already know" block: top-K relevant prior claims for characters/world appearing in this scene, plus seed `characters` / `world_elements` rows in summary form. Used for both grounding and contradiction detection.
3. JSON schema for the response: arrays of `claims` and `contradictions`.

### 5.4 Response schema (Zod)

```
ExtractedClaimsResponse = {
  claims: Array<{
    kind, subject_type, subject_label, subject_ref_hint?,
    predicate, object_text,
    paragraph_start, paragraph_end,
    confidence
  }>,
  contradictions: Array<{
    summary,
    conflicting_claim_ids: string[],   // ids from the "what we already know" block
    paragraph_start, paragraph_end,
    confidence
  }>,
  new_entities: Array<{                // Tier B candidates
    name, kind: 'character'|'world_element', category?,
    paragraph_start, paragraph_end
  }>
}
```

### 5.5 Subject resolution

For each claim, we resolve `subject_ref` server-side (not by the LLM):

1. If `subject_ref_hint` matches an existing `characters.id` / `world_elements.id` (or alias), use it.
2. Else fuzzy-match `subject_label` against name + aliases of project entities (case-insensitive, normalized).
3. Else leave `subject_ref` null — claim still stored, will surface as a Tier B "new entity?" annotation.

This logic lives in `web/src/lib/ai/continuity/resolve-subject.ts` and is unit-tested.

### 5.6 Annotation generation (the tiering pass)

After claims are inserted, a deterministic (non-LLM) pass turns claims + contradictions into annotations using the tier rules in §6. This keeps tiering stable and testable, independent of LLM moodiness.

## 6. Tiered Annotation Rules (the "nagging dial")

These rules are the contract for what surfaces inline vs only in the Codex Review.

### Tier A — surface in gutter immediately

Triggered for:

- **Contradictions** where a new claim conflicts with a `confirmed` claim (high confidence).
- **Named entity collisions** — new `subject_label` exactly matches an existing distinct entity name (possible "two Marcuses" issue).
- **Timeline impossibilities** — referenced past event has no prior occurrence in the project, OR temporal markers contradict scene ordering. (v1 scope: only flag explicit timeline contradictions detected by the LLM in `contradictions[]`. Full timeline graph is out-of-scope.)

Visual: small amber/red dot in the gutter at `paragraph_index`. Click to open detail.

### Tier B — surface only on pause

Triggered for:

- New entity introduction (`new_entities[]` entries).
- New significant attribute on a known entity with `confidence >= medium` for predicates in a curated "significant" list (e.g. `fears`, `wound`, `desire`, `power`, `secret`, `relationship_shift`).
- Relationship sentiment change (claim with `predicate` in {`distrusts`, `loves`, `betrays`, `forgives`, …}) where prior relationship row exists.

Visual: faint ghost dot in gutter. Only renders when (a) author idle ≥ 8s, **and** (b) cursor is past the end of the relevant paragraph, **and** (c) author is not in a typing sprint (see §6.3).

### Tier C — never surface inline; Codex Review only

Everything else:

- Descriptive flavor (`appearance`, `clothing`, `setting_detail`)
- Low-confidence claims of any kind
- Repeat reinforcements of already-confirmed facts

### 6.1 The dial

Single user setting `continuity_dial`: `quiet | helpful | vigilant`.

- `quiet` → only Tier A
- `helpful` (default) → A + B
- `vigilant` → A + B + low-confidence promoted to B

Stored on `profiles` (or new `user_settings` table if none exists). Read by gutter component; not by extractor (extractor always runs full pipeline; dial only filters render).

### 6.2 Anti-nag safeguards (all enforced in the gutter component)

1. **Sentence-boundary debounce.** Tier B annotations only render when the cursor is *outside* the paragraph they attach to.
2. **Idle threshold.** Tier B requires ≥ 8s idle (no keystrokes).
3. **Typing-sprint suppression.** If sustained input rate > 80 wpm over the last 30s, suppress all Tier B/C visibility until rate drops.
4. **Per-paragraph deduplication.** Max 1 visible annotation per paragraph; if multiple, render the highest-tier one with a "+N more" badge.
5. **Session-dismiss.** Dismissed annotations don't reappear in the same session (`dismissed_session_id`).
6. **Per-scene cap.** Max 5 visible Tier B at once; overflow goes to Codex Review only.

### 6.3 Sprint detection helper

A small client hook `useTypingSprint(editor)` measures rolling wpm via TipTap's `onUpdate`. Returns `{ wpm, isSprinting }`. Pure function, easily unit-tested.

## 7. The Margin Gutter UI

### 7.1 Why a sibling gutter, not ProseMirror decorations

Two reasons:

1. The annotation must align with **paragraph rectangles**, not character ranges, and must remain stable across re-renders.
2. We need it to work identically in the 3-pane scene view and in focus mode without fighting layout each time.

Approach: a sibling `<ContinuityGutter>` component, absolutely positioned to the *left* of the editor's content column. It computes paragraph offsets via `editor.view.coordsAtPos` for the start of each paragraph node and renders dots at those Y positions.

### 7.2 Component contract

`<ContinuityGutter editor={editor} sceneId={sceneId} dial={dial} />`

Responsibilities:

- Subscribe to annotation changes for `sceneId` (initial fetch + revalidate after every scene save).
- Walk the doc on every TipTap transaction (cheap — only paragraph starts) to compute Y positions.
- Render dots; click opens a popover with `summary`, citation link, and actions (Confirm / Dismiss / Open in Codex).
- Honor tier rules from §6 when deciding visibility.

### 7.3 Integration points

- `web/src/components/prose-editor.tsx`: accept new props `enableContinuityGutter?: boolean` and `sceneId` (already present). When enabled, render `<ContinuityGutter>` as a sibling inside the same `relative` wrapper.
- `web/src/app/(app)/scenes/[id]/scene-focus-client.tsx`: pass `enableContinuityGutter` in **both** the 3-pane and focus layouts. In focus mode the gutter sits in the empty left margin of the centered `max-w-3xl` column; in 3-pane it sits between the spine and the prose.

### 7.4 Server actions

New file `web/src/app/(app)/scenes/[id]/continuity/actions.ts`:

- `listAnnotationsForScene(sceneId)` → `{ id, paragraph_index, tier, kind, summary, status }[]`
- `getAnnotationDetail(annotationId)` → full detail incl. claim citations
- `confirmAnnotation(annotationId)` → promotes underlying claims to `confirmed`, mirrors any rollups (e.g. updates `characters.fears`, inserts `relationship_beats`), marks annotation `resolved`
- `dismissAnnotation(annotationId, scope: 'session'|'permanent')`
- `rejectClaim(claimId, reason?)` → marks claim `rejected`, removes derived annotations

All return shapes typed in `web/src/lib/supabase/types.ts`.

## 8. Codex Review Screen (chapter-level)

### 8.1 Trigger

- Button in `chapter-toolbar.tsx` ("Review Codex").
- Auto-prompt on chapter status change to `complete`.
- Threshold prompt: when ≥ 25 unreviewed `auto` claims accumulated in a chapter, show a non-blocking toast "12 things to review in your codex".

### 8.2 Layout

Single-column review screen at `web/src/app/(app)/chapters/[id]/codex-review/page.tsx`. Top: narrative summary ("In this chapter we learned X new things about Elena, met Lyra, and noted 1 possible inconsistency."). Below: grouped list.

### 8.3 Grouping

Claims grouped by **subject** then **kind**:

```
Elena (5 new)
  ☑ has_trait → "fears water"        high · scene 4¶3 · [view]
  ☑ has_relation → "mother is Rina"  high · scene 4¶8 · [view]
  ☐ is → "left-handed?"              low  · scene 5¶2 · [confirm/reject]

New character: Lyra
  introduced in scene 5¶1
  related claims: sister to Marcus, healer, distrusts Elena
  [Accept all] [Edit before saving] [Reject]

Possible inconsistency
  Ch.2 says journey takes 3 days; Ch.5 implies 5.
  [Reconcile…]
```

### 8.4 Bulk actions

- **Accept all high-confidence** — promotes every `confidence='high'` `auto` claim in scope to `confirmed` and runs the rollup mirroring (characters/world/relationships).
- **Reject all** — marks all `auto` in scope `rejected`.
- **Skip review** — deferred; claims stay `auto`. AI generation still uses them at lower weight.

### 8.5 Promotion / rollup mirroring

When a claim is confirmed:

- `kind=attribute, subject_type=character` → patch the matching field on `characters` (e.g. append to `voice_notes`, set `wound`, etc) using a small mapping table `CLAIM_PREDICATE_TO_CHARACTER_FIELD` in `web/src/lib/ai/continuity/promote.ts`.
- `kind=entity_introduction, subject_type=character` → INSERT into `characters` if not present.
- `kind=relationship` → upsert `relationships` and append a `relationship_beats` row tied to `source_scene_id`.
- `kind=world_rule` or `kind=attribute, subject_type=world_element` → upsert `world_elements`.
- `kind=event` → upsert `open_threads` if predicate is `raises_question`; otherwise no rollup, claim is its own record.

This mapping is the **only** code that touches existing canonical tables. Easy to audit, easy to extend.

## 9. Auto-Wiki Views

The wiki is not a new table. It is a **read-only assembled view** of confirmed + auto claims for an entity, grouped by predicate, with citations.

- New page: `web/src/app/(app)/characters/[id]/codex/page.tsx` — the character's "what we know" view: every claim where `subject_ref = character.id`, grouped by predicate, sorted by confidence then recency, each row clickable to its source scene paragraph.
- Same pattern for `world/[id]/codex/page.tsx`.
- v1: read-only. No editing in the codex view itself — edits flow through Codex Review or the existing character/world forms.

## 10. AI Generation Context Injection

Modify `web/src/lib/ai/context.ts` (or wherever `buildContext` assembles) to add a new section: **Continuity facts**.

Per generation request, given the scene being worked on:

1. Identify referenced entities (POV character, characters present, locations).
2. For each, fetch top-K claims (by `confidence` desc, then recency) — separate buckets: `confirmed` and `auto`.
3. Render into the prompt as:

```
CONFIRMED CANON (do not contradict):
- Elena fears water. (ch.4)
- Marcus is Lyra's brother. (ch.5)

TENTATIVE (from your prose; prefer over invention but may evolve):
- Elena's mother is Rina. (ch.4, unconfirmed)
- Lyra distrusts Elena. (ch.5, unconfirmed)
```

1. Pass-through to `askPersona` / `askModel`.

This is the feedback loop: **the more she writes, the smarter the assistant becomes about her specific world**, with zero form-filling.

## 11. Phasing / MVP

### Phase 1 — Silent foundation (no user-visible changes)

1. Migration: `claims` + `continuity_annotations` tables, RLS policies, indices.
2. `extractContinuity` extractor + Zod schemas + subject resolver + unit tests (pure functions).
3. Wire into `firePostSaveScenePipeline`. Behind feature flag `continuity_editor.enabled`.
4. Continuity Editor persona + prompt.
5. Confirms claims accumulate correctly with no UI yet (smoke-test via DB).

### Phase 2 — Codex Review screen

1. `codex-review/page.tsx` with grouping, bulk actions, promotion/rollup logic.
2. Button in `chapter-toolbar.tsx`.
3. End-of-chapter auto-prompt.

### Phase 3 — Margin gutter

1. `ContinuityGutter` component + paragraph-position math.
2. Tier A annotations only first (contradictions + entity collisions).
3. Wire into both 3-pane and focus-mode layouts.
4. Server actions for confirm/dismiss/reject.

### Phase 4 — Tier B + nagging dial

1. Sprint detection hook.
2. Idle + cursor-position gating.
3. Settings UI for the dial.
4. Per-scene cap and "+N more" badge.

### Phase 5 — AI context injection

1. Extend `buildContext` to include claims block.
2. Update `askPersona` system prompt to honor tentative-vs-confirmed distinction.
3. A/B compare scene generations with vs without the new block (manual eyeball).

### Phase 6 — Auto-wiki view

1. Read-only `/characters/[id]/codex` and `/world/[id]/codex`.

### Deferred (post-MVP)

- Seed Canon (Option 3) for architect-style users.
- Validator-pass confidence scoring.
- Relationship graph visualization.
- Timeline graph + true temporal contradiction detection.
- Real-time collaboration on Codex Review (`supabase realtime` already a dep).
- Dual-pane Architect/Prose view (Option 7).

## 12. Test Strategy

> Codebase has no test framework today. Phase 1 should add **Vitest** (lightweight, Next 16 friendly) for the new pure logic only. Do not retrofit tests across the whole app.

### 12.1 Unit tests (Vitest, pure functions only)

- `resolve-subject.test.ts` — fuzzy name matching, alias hits, case normalization, no-match → null.
- `tiering.test.ts` — given a list of claims + contradictions, produces the expected annotation tiers.
- `promote.test.ts` — claim → canonical-table mutation mapping table is exhaustive and correct.
- `extract-json.test.ts` — JSON repair / strip-fence on representative malformed model outputs (lift fixtures from real failures).
- `useTypingSprint.test.ts` — feed synthetic event streams, assert wpm + sprinting flag.

### 12.2 Integration tests (manual scripted, no framework)

- A throwaway `scripts/continuity-smoke.ts` that:
  1. Seeds a project + chapter + scene with known prose.
  2. Calls `extractContinuity` directly.
  3. Asserts expected claims appear in DB.
  Run locally before each phase ships.

### 12.3 LLM evaluation (manual)

A small fixtures folder `web/test-fixtures/continuity/` with 5–10 hand-graded scene snippets and the expected high-confidence claims. Run extractor against them and eyeball precision/recall after any prompt change.

## 13. Open Risks & Mitigations


| Risk                                                                      | Mitigation                                                                                                                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extractor hallucinates "confirmed" facts that aren't in the prose         | Conservative system prompt; everything starts as `auto`; only Codex Review or explicit confirm promotes. Author is in the loop before anything mutates `characters`/`world_elements`.             |
| Gutter dots flicker/jump as paragraphs reflow during typing               | Compute positions only on transaction commit + `requestAnimationFrame`; suppress visibility entirely while `isSprinting`.                                                                         |
| Cost of running extraction on every save                                  | (a) Debounced by autosave already (~900ms). (b) Idempotent via content hash — no re-run if unchanged. (c) Optional: only run after a save if scene grew by ≥ N words since last extraction.       |
| Claim table grows unbounded                                               | `superseded` claims are kept but excluded from default queries via partial index. Optional vacuum job after 90 days of `superseded`.                                                              |
| Two "Marcus" entities collide silently                                    | Tier A "duplicate name" annotation is the explicit first-class case for this.                                                                                                                     |
| Author finds the gutter annoying                                          | The dial defaults to `helpful` but the slider is one click away. Phase 3 ships with Tier A only — most conservative — to set initial expectations.                                                |
| Multi-scene contradictions not caught (extractor only sees current scene) | The "what we already know" context block in the prompt is exactly the cross-scene grounding. Augment with RAG via existing `match_scene_chunks` for entities not in the immediate context budget. |


## 14. File Map (new + modified)

**New:**

- `supabase/migrations/00XX_continuity_editor.sql`
- `web/src/lib/ai/continuity/extract.ts`
- `web/src/lib/ai/continuity/schemas.ts`
- `web/src/lib/ai/continuity/resolve-subject.ts`
- `web/src/lib/ai/continuity/tiering.ts`
- `web/src/lib/ai/continuity/promote.ts`
- `web/src/lib/ai/continuity/context.ts` (claim-block prompt builder)
- `web/src/components/continuity-gutter.tsx`
- `web/src/hooks/use-typing-sprint.ts`
- `web/src/app/(app)/scenes/[id]/continuity/actions.ts`
- `web/src/app/(app)/chapters/[id]/codex-review/page.tsx`
- `web/src/app/(app)/chapters/[id]/codex-review/codex-review-client.tsx`
- `web/src/app/(app)/characters/[id]/codex/page.tsx`
- `web/src/app/(app)/world/[id]/codex/page.tsx`
- `web/test-fixtures/continuity/*.md` + tests under colocated `*.test.ts`
- `vitest.config.ts` (Phase 1 only)

**Modified:**

- `web/src/lib/ai/post-save-scene.ts` — add `extractContinuity` step
- `web/src/lib/ai/personas.ts` — add `continuity_editor` persona
- `web/src/lib/ai/context.ts` — inject claim block in `buildContext`
- `web/src/components/prose-editor.tsx` — accept `enableContinuityGutter`, render gutter
- `web/src/app/(app)/scenes/[id]/scene-focus-client.tsx` — pass flag in both layouts
- `web/src/app/(app)/chapters/[id]/chapter-toolbar.tsx` — "Review Codex" button
- `web/src/lib/supabase/types.ts` — add `Claim`, `ContinuityAnnotation`, settings types
- `web/src/lib/env.ts` — feature flag if not env-driven

## 15. Acceptance Criteria for "MVP Done" (after Phase 1–3)

1. Author writes a scene introducing a new character "Lyra" with a fear of fire. After save, a `claim` row exists with `subject_label='Lyra'`, `predicate='fears'`, `object_text='fire'`, `confidence='high'`, `status='auto'`.
2. Within 2s of save completing, a Tier B (or Tier A if dial=vigilant) annotation appears in the gutter at Lyra's introduction paragraph in **both** focus mode and 3-pane view.
3. At end of chapter, "Review Codex" shows Lyra grouped under "New character" with all extracted claims, and "Accept all" creates a `characters` row + linked confirmed claims.
4. The next AI scene generation that involves Lyra references her fear of fire in its planning context (verifiable via the `ai_interactions` log).
5. Editing the scene to remove the fear and saving again marks the original claim `superseded` and creates a new claim (or none); the gutter annotation updates accordingly.
6. Dismissing an annotation does not bring it back in the same session; it reappears next session unless `permanent` was chosen.

---

**Status:** Plan ready for review. Once approved, Phase 1 is the smallest standalone slice that produces verifiable value (claims accumulating in DB) without any UI risk.