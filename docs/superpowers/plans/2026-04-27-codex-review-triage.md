# Codex Review Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn chapter Codex review into a selectable triage workflow that shows confidence and destination, supports alias/merge resolution, and promotes character, world, and relationship facts to the right canonical records.

**Architecture:** Keep `continuity_claims` as the review queue, add small metadata fields for proposed routing, then build focused server utilities for destination display, subject resolution, and relationship promotion. The page remains a server-loaded Next.js route with a client triage component that calls server actions for selected IDs.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase, Postgres migrations, Vitest.

---

## File Structure

- Modify: `supabase/migrations/0008_codex_review_triage.sql`
  - Adds claim routing metadata and indexes for review filtering.
- Modify: `web/src/lib/supabase/types.ts`
  - Updates `ContinuityClaim` and related types to include routing metadata.
- Modify: `web/src/lib/ai/continuity/schemas.ts`
  - Adds optional extraction fields for destination/category/relationship hints.
- Modify: `web/src/lib/ai/continuity/extract.ts`
  - Gives the extractor a real entity index, persists proposed world category, and resolves relationship candidates.
- Modify: `web/src/lib/ai/continuity/resolve-subject.ts`
  - Returns exact match plus candidate suggestions for aliases/first-name matches.
- Modify: `web/src/lib/ai/continuity/resolve-subject.test.ts`
  - Covers exact, alias, unique first-name candidate, ambiguous first-name candidate, and world matches.
- Create: `web/src/lib/ai/continuity/resolve-relationship.ts`
  - Finds stable character-pair relationship destinations independent of stored character order.
- Create: `web/src/lib/ai/continuity/resolve-relationship.test.ts`
  - Covers pair matching independent of character order and create payload shape.
- Modify: `web/src/lib/ai/continuity/promote.ts`
  - Promotes world introductions/categories and relationship claims.
- Create: `web/src/lib/ai/continuity/promote.test.ts`
  - Uses a small fake Supabase client to verify patch decisions without network calls.
- Create: `web/src/app/(app)/chapters/[id]/codex-review/codex-review-model.ts`
  - Converts raw rows into UI-friendly rows with confidence labels, destination labels, and resolution state.
- Modify: `web/src/app/(app)/chapters/[id]/codex-review/page.tsx`
  - Loads characters, world elements, and relationships needed for destination visibility and merge controls.
- Modify: `web/src/app/(app)/chapters/[id]/codex-review/codex-review-client.tsx`
  - Adds selectable rows, filters, badges, destination display, and resolution controls.
- Modify: `web/src/app/(app)/chapters/[id]/codex-actions.ts`
  - Adds selected-confirm, selected-reject, and resolve-to-destination actions.
- Create: `web/src/app/(app)/relationships/[id]/codex/page.tsx`
  - Mirrors character/world codex pages for relationship claims.

---

## Task 1: Database and Types for Routing Metadata

**Files:**
- Create: `supabase/migrations/0008_codex_review_triage.sql`
- Modify: `web/src/lib/supabase/types.ts`

- [ ] **Step 1: Add the migration**

Create `supabase/migrations/0008_codex_review_triage.sql`:

```sql
-- Codex review triage: proposed routing and category metadata.

alter table continuity_claims
  add column if not exists proposed_destination_type text
    check (proposed_destination_type in ('character', 'world_element', 'relationship', 'scene', 'unresolved')),
  add column if not exists proposed_world_category text,
  add column if not exists resolution_status text not null default 'unresolved'
    check (resolution_status in ('resolved', 'candidate', 'ambiguous', 'unresolved')),
  add column if not exists resolution_note text;

create index if not exists continuity_claims_review_triage_idx
  on continuity_claims (project_id, status, confidence, resolution_status)
  where status = 'auto';

create index if not exists continuity_claims_subject_relationship_idx
  on continuity_claims (subject_relationship_id)
  where subject_relationship_id is not null;
```

- [ ] **Step 2: Update TypeScript claim type**

In `web/src/lib/supabase/types.ts`, update `ContinuityClaim`:

```ts
export type ContinuityClaim = {
  id: string;
  project_id: string;
  source_scene_id: string;
  source_paragraph_start: number;
  source_paragraph_end: number;
  kind: string;
  subject_type: string;
  subject_label: string;
  subject_character_id: string | null;
  subject_world_element_id: string | null;
  subject_relationship_id: string | null;
  proposed_destination_type:
    | "character"
    | "world_element"
    | "relationship"
    | "scene"
    | "unresolved"
    | null;
  proposed_world_category: string | null;
  resolution_status: "resolved" | "candidate" | "ambiguous" | "unresolved";
  resolution_note: string | null;
  predicate: string;
  object_text: string;
  confidence: "low" | "medium" | "high";
  status: "auto" | "confirmed" | "rejected" | "superseded";
  superseded_by: string | null;
  tier: "A" | "B" | "C" | null;
  extractor_version: number;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 3: Verify types compile**

Run:

```bash
cd web && npm run test -- src/lib/ai/continuity/resolve-subject.test.ts
```

Expected: existing resolver tests pass or fail only because implementation changes have not started. No TypeScript syntax errors should appear from `types.ts`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0008_codex_review_triage.sql web/src/lib/supabase/types.ts
git commit -m "chore: add codex review routing metadata"
```

---

## Task 2: Subject Resolution Candidates

**Files:**
- Modify: `web/src/lib/ai/continuity/resolve-subject.ts`
- Modify: `web/src/lib/ai/continuity/resolve-subject.test.ts`

- [ ] **Step 1: Write failing tests for name candidates**

Replace `web/src/lib/ai/continuity/resolve-subject.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { resolveSubject } from "./resolve-subject";

describe("resolveSubject", () => {
  const chars = [
    { id: "c1", name: "Elena Vale", aliases: ["El"] },
    { id: "c2", name: "Marcus Thorn", aliases: [] },
    { id: "c3", name: "Ava Larent", aliases: [] },
    { id: "c4", name: "Ava Morgan", aliases: [] },
  ];
  const worlds = [{ id: "w1", name: "The Hollow", aliases: ["Hollow"] }];

  it("matches UUID hint on character", () => {
    expect(resolveSubject("x", "c1", chars, worlds)).toMatchObject({
      subject_character_id: "c1",
      subject_world_element_id: null,
      resolution_status: "resolved",
    });
  });

  it("matches exact character name", () => {
    expect(resolveSubject("Marcus Thorn", null, chars, worlds)).toMatchObject({
      subject_character_id: "c2",
      resolution_status: "resolved",
    });
  });

  it("matches alias", () => {
    expect(resolveSubject("El", null, chars, worlds)).toMatchObject({
      subject_character_id: "c1",
      resolution_status: "resolved",
    });
  });

  it("suggests a unique first-name character without auto-linking", () => {
    expect(resolveSubject("Marcus", null, chars, worlds)).toEqual({
      subject_character_id: null,
      subject_world_element_id: null,
      resolution_status: "candidate",
      resolution_note: "Possible character match: Marcus Thorn",
      candidates: [{ type: "character", id: "c2", label: "Marcus Thorn", reason: "first_name" }],
    });
  });

  it("marks ambiguous first-name matches", () => {
    const result = resolveSubject("Ava", null, chars, worlds);
    expect(result.resolution_status).toBe("ambiguous");
    expect(result.candidates.map((c) => c.label)).toEqual(["Ava Larent", "Ava Morgan"]);
  });

  it("matches world element exact name", () => {
    expect(resolveSubject("The Hollow", null, chars, worlds)).toMatchObject({
      subject_character_id: null,
      subject_world_element_id: "w1",
      resolution_status: "resolved",
    });
  });

  it("returns unresolved when unknown", () => {
    expect(resolveSubject("Nobody", null, chars, worlds)).toEqual({
      subject_character_id: null,
      subject_world_element_id: null,
      resolution_status: "unresolved",
      resolution_note: null,
      candidates: [],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd web && npm run test -- src/lib/ai/continuity/resolve-subject.test.ts
```

Expected: FAIL because `resolution_status`, `resolution_note`, and `candidates` are not returned yet.

- [ ] **Step 3: Implement candidate-aware resolver**

Replace `web/src/lib/ai/continuity/resolve-subject.ts` with:

```ts
export type EntityRow = {
  id: string;
  name: string;
  aliases: string[] | null;
};

export type SubjectCandidate = {
  type: "character" | "world_element";
  id: string;
  label: string;
  reason: "first_name" | "alias" | "partial";
};

export type SubjectResolution = {
  subject_character_id: string | null;
  subject_world_element_id: string | null;
  resolution_status: "resolved" | "candidate" | "ambiguous" | "unresolved";
  resolution_note: string | null;
  candidates: SubjectCandidate[];
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function firstToken(s: string): string {
  return norm(s).split(" ")[0] ?? "";
}

function resolvedCharacter(id: string): SubjectResolution {
  return {
    subject_character_id: id,
    subject_world_element_id: null,
    resolution_status: "resolved",
    resolution_note: null,
    candidates: [],
  };
}

function resolvedWorld(id: string): SubjectResolution {
  return {
    subject_character_id: null,
    subject_world_element_id: id,
    resolution_status: "resolved",
    resolution_note: null,
    candidates: [],
  };
}

function unresolved(): SubjectResolution {
  return {
    subject_character_id: null,
    subject_world_element_id: null,
    resolution_status: "unresolved",
    resolution_note: null,
    candidates: [],
  };
}

/** Match label or hint UUID against characters / world elements; report candidates when exact resolution is unsafe. */
export function resolveSubject(
  subjectLabel: string,
  subjectRefHint: string | null | undefined,
  characters: EntityRow[],
  worldElements: EntityRow[],
): SubjectResolution {
  if (subjectRefHint) {
    const ch = characters.find((c) => c.id === subjectRefHint);
    if (ch) return resolvedCharacter(ch.id);
    const w = worldElements.find((e) => e.id === subjectRefHint);
    if (w) return resolvedWorld(w.id);
  }

  const n = norm(subjectLabel);
  if (!n) return unresolved();

  const chMatch = characters.find((c) => norm(c.name) === n);
  if (chMatch) return resolvedCharacter(chMatch.id);

  const chAlias = characters.find((c) =>
    (c.aliases ?? []).some((a) => norm(a) === n),
  );
  if (chAlias) return resolvedCharacter(chAlias.id);

  const wMatch = worldElements.find((e) => e.name && norm(e.name) === n);
  if (wMatch) return resolvedWorld(wMatch.id);

  const wAlias = worldElements.find((e) =>
    (e.aliases ?? []).some((a) => norm(a) === n),
  );
  if (wAlias) return resolvedWorld(wAlias.id);

  const characterCandidates = characters
    .filter((c) => firstToken(c.name) === n)
    .map<SubjectCandidate>((c) => ({
      type: "character",
      id: c.id,
      label: c.name,
      reason: "first_name",
    }));

  if (characterCandidates.length === 1) {
    return {
      subject_character_id: null,
      subject_world_element_id: null,
      resolution_status: "candidate",
      resolution_note: `Possible character match: ${characterCandidates[0].label}`,
      candidates: characterCandidates,
    };
  }

  if (characterCandidates.length > 1) {
    return {
      subject_character_id: null,
      subject_world_element_id: null,
      resolution_status: "ambiguous",
      resolution_note: `Multiple possible character matches: ${characterCandidates
        .map((c) => c.label)
        .join(", ")}`,
      candidates: characterCandidates,
    };
  }

  return unresolved();
}
```

- [ ] **Step 4: Run resolver tests**

Run:

```bash
cd web && npm run test -- src/lib/ai/continuity/resolve-subject.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/ai/continuity/resolve-subject.ts web/src/lib/ai/continuity/resolve-subject.test.ts
git commit -m "feat: suggest codex subject merge candidates"
```

---

## Task 3: Extraction Persists Routing Status and World Categories

**Files:**
- Modify: `web/src/lib/ai/continuity/schemas.ts`
- Modify: `web/src/lib/ai/continuity/extract.ts`

- [ ] **Step 1: Extend extraction schema**

In `web/src/lib/ai/continuity/schemas.ts`, extend `ExtractedClaimRaw`:

```ts
export const ExtractedClaimRaw = z.object({
  kind: z.enum([
    "attribute",
    "relationship",
    "event",
    "world_rule",
    "entity_introduction",
  ]),
  subject_type: z.enum([
    "character",
    "world_element",
    "relationship",
    "scene",
    "unknown",
  ]),
  subject_label: z.string(),
  subject_ref_hint: z.string().uuid().optional().nullable(),
  predicate: z.string(),
  object_text: z.string(),
  paragraph_start: z.number().int().min(0),
  paragraph_end: z.number().int().min(0),
  confidence: z.enum(["low", "medium", "high"]),
  proposed_world_category: z.string().optional().nullable(),
  relationship_character_labels: z.array(z.string()).max(2).optional().default([]),
});
```

- [ ] **Step 2: Update extractor prompt**

In `web/src/lib/ai/continuity/extract.ts`, change `buildUserPrompt` to accept entity index lines:

```ts
function buildUserPrompt(input: {
  paragraphs: string[];
  priorClaimLines: string[];
  entityIndexLines: string[];
}): string {
  const numbered = input.paragraphs
    .map((p, i) => `<<<PARAGRAPH_${i}>>>\n${p}`)
    .join("\n\n");

  const prior =
    input.priorClaimLines.length > 0
      ? input.priorClaimLines.join("\n")
      : "(none yet)";

  const entityIndex =
    input.entityIndexLines.length > 0
      ? input.entityIndexLines.join("\n")
      : "(none yet)";

  return `ENTITY INDEX (use these ids in subject_ref_hint when the claim is clearly about an existing entity):
${entityIndex}

PRIOR CLAIMS (reference by id in contradictions.conflicting_claim_ids only if listed here):
${prior}

CURRENT SCENE (${input.paragraphs.length} paragraphs, indices 0-${Math.max(0, input.paragraphs.length - 1)}):

${numbered}

Return a single JSON object:
{
  "claims": [
    {
      "kind": "attribute | relationship | event | world_rule | entity_introduction",
      "subject_type": "character | world_element | relationship | scene | unknown",
      "subject_label": "short name",
      "subject_ref_hint": "optional uuid from ENTITY INDEX or null",
      "predicate": "short verb token, e.g. fears, distrusts, located_in, rule",
      "object_text": "what the prose supports",
      "paragraph_start": 0,
      "paragraph_end": 0,
      "confidence": "low | medium | high",
      "proposed_world_category": "optional category when subject_type is world_element",
      "relationship_character_labels": ["first character name", "second character name"]
    }
  ],
  "contradictions": [
    {
      "summary": "one sentence - what clashes with earlier canon",
      "conflicting_claim_ids": ["uuid-from-prior-list"],
      "paragraph_start": 0,
      "paragraph_end": 0,
      "confidence": "low | medium | high"
    }
  ],
  "new_entities": [
    {
      "name": "proper name introduced",
      "kind": "character | world_element",
      "category": "optional for world_element",
      "paragraph_start": 0,
      "paragraph_end": 0
    }
  ]
}

If nothing is extractable, return {"claims":[],"contradictions":[],"new_entities":[]}.`;
}
```

- [ ] **Step 3: Build entity index lines**

After `entityWorlds` is built in `extract.ts`, add:

```ts
const entityIndexLines = [
  ...charRows.map((c) => {
    const aliases = (c.aliases ?? []).length ? ` aliases=${c.aliases.join(", ")}` : "";
    return `character | ${c.id} | ${c.name}${aliases}`;
  }),
  ...worldRows.map((w) => {
    const aliases = (w.aliases ?? []).length ? ` aliases=${w.aliases.join(", ")}` : "";
    const category = w.category ? ` category=${w.category}` : "";
    return `world_element | ${w.id} | ${w.name ?? "Unnamed"}${category}${aliases}`;
  }),
];
```

- [ ] **Step 4: Persist routing fields**

Update the model call to pass `entityIndexLines`:

```ts
user: buildUserPrompt({ paragraphs, priorClaimLines, entityIndexLines }),
```

Update `claimInserts`:

```ts
const destinationType =
  c.subject_type === "relationship"
    ? "relationship"
    : c.subject_type === "world_element"
      ? "world_element"
      : c.subject_type === "character"
        ? "character"
        : c.subject_type === "scene"
          ? "scene"
          : "unresolved";

return {
  project_id: chapter.project_id,
  source_scene_id: sceneId,
  source_paragraph_start: c.paragraph_start,
  source_paragraph_end: c.paragraph_end,
  kind: c.kind,
  subject_type: c.subject_type,
  subject_label: c.subject_label,
  subject_character_id: resolved.subject_character_id,
  subject_world_element_id: resolved.subject_world_element_id,
  subject_relationship_id: null as string | null,
  proposed_destination_type: destinationType,
  proposed_world_category: c.proposed_world_category ?? null,
  resolution_status: resolved.resolution_status,
  resolution_note: resolved.resolution_note,
  predicate: c.predicate,
  object_text: c.object_text,
  confidence: c.confidence,
  status: "auto" as const,
  superseded_by: null as string | null,
  tier: null as string | null,
  extractor_version: CONTINUITY_EXTRACTOR_VERSION,
};
```

- [ ] **Step 5: Run continuity tests**

Run:

```bash
cd web && npm run test -- src/lib/ai/continuity/resolve-subject.test.ts src/lib/ai/continuity/tiering.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/ai/continuity/schemas.ts web/src/lib/ai/continuity/extract.ts
git commit -m "feat: persist codex routing metadata"
```

---

## Task 4: Relationship Resolution Utility

**Files:**
- Create: `web/src/lib/ai/continuity/resolve-relationship.ts`
- Create: `web/src/lib/ai/continuity/resolve-relationship.test.ts`

- [ ] **Step 1: Write relationship resolver tests**

Create `web/src/lib/ai/continuity/resolve-relationship.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findRelationshipForPair, relationshipPairKey } from "./resolve-relationship";

describe("relationshipPairKey", () => {
  it("uses stable ordering", () => {
    expect(relationshipPairKey("b", "a")).toBe("a:b");
    expect(relationshipPairKey("a", "b")).toBe("a:b");
  });
});

describe("findRelationshipForPair", () => {
  const rows = [
    { id: "r1", char_a_id: "c1", char_b_id: "c2" },
    { id: "r2", char_a_id: "c3", char_b_id: "c4" },
  ];

  it("finds a relationship regardless of stored character order", () => {
    expect(findRelationshipForPair(rows, "c2", "c1")).toEqual({
      id: "r1",
      char_a_id: "c1",
      char_b_id: "c2",
    });
  });

  it("returns null when either character is missing", () => {
    expect(findRelationshipForPair(rows, "c1", null)).toBeNull();
  });

  it("returns null when no pair exists", () => {
    expect(findRelationshipForPair(rows, "c1", "c4")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd web && npm run test -- src/lib/ai/continuity/resolve-relationship.test.ts
```

Expected: FAIL because the file does not exist.

- [ ] **Step 3: Implement relationship resolver**

Create `web/src/lib/ai/continuity/resolve-relationship.ts`:

```ts
export type RelationshipPairRow = {
  id: string;
  char_a_id: string | null;
  char_b_id: string | null;
};

export function relationshipPairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export function findRelationshipForPair(
  relationships: RelationshipPairRow[],
  charAId: string | null,
  charBId: string | null,
): RelationshipPairRow | null {
  if (!charAId || !charBId || charAId === charBId) return null;

  const target = relationshipPairKey(charAId, charBId);
  return (
    relationships.find((r) => {
      if (!r.char_a_id || !r.char_b_id) return false;
      return relationshipPairKey(r.char_a_id, r.char_b_id) === target;
    }) ?? null
  );
}
```

- [ ] **Step 4: Run relationship tests**

Run:

```bash
cd web && npm run test -- src/lib/ai/continuity/resolve-relationship.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/ai/continuity/resolve-relationship.ts web/src/lib/ai/continuity/resolve-relationship.test.ts
git commit -m "feat: resolve relationship codex destinations"
```

---

## Task 5: Promotion for World Categories and Relationships

**Files:**
- Modify: `web/src/lib/ai/continuity/promote.ts`
- Create: `web/src/lib/ai/continuity/promote.test.ts`

- [ ] **Step 1: Add promotion tests**

Create `web/src/lib/ai/continuity/promote.test.ts` with a fake Supabase helper that records updates:

```ts
import { describe, expect, it } from "vitest";
import { buildCanonPatchForClaim } from "./promote";
import type { ContinuityClaim } from "@/lib/supabase/types";

function claim(overrides: Partial<ContinuityClaim>): ContinuityClaim {
  return {
    id: "claim-1",
    project_id: "project-1",
    source_scene_id: "scene-1",
    source_paragraph_start: 0,
    source_paragraph_end: 0,
    kind: "attribute",
    subject_type: "character",
    subject_label: "Ava",
    subject_character_id: null,
    subject_world_element_id: null,
    subject_relationship_id: null,
    proposed_destination_type: null,
    proposed_world_category: null,
    resolution_status: "unresolved",
    resolution_note: null,
    predicate: "appearance",
    object_text: "dark curls",
    confidence: "high",
    status: "auto",
    superseded_by: null,
    tier: null,
    extractor_version: 1,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("buildCanonPatchForClaim", () => {
  it("maps relationship claims to arc notes", () => {
    expect(
      buildCanonPatchForClaim(
        claim({
          kind: "relationship",
          subject_type: "relationship",
          subject_relationship_id: "rel-1",
          predicate: "distrusts",
          object_text: "Ava distrusts Marcus after the ambush.",
        }),
      ),
    ).toEqual({
      table: "relationships",
      id: "rel-1",
      field: "arc_notes",
      value: "distrusts: Ava distrusts Marcus after the ambush.",
    });
  });

  it("maps world introductions to description with category preserved", () => {
    expect(
      buildCanonPatchForClaim(
        claim({
          kind: "entity_introduction",
          subject_type: "world_element",
          subject_world_element_id: "world-1",
          proposed_world_category: "organization",
          predicate: "introduced",
          object_text: "The Glass Court controls the port.",
        }),
      ),
    ).toEqual({
      table: "world_elements",
      id: "world-1",
      field: "description",
      value: "The Glass Court controls the port.",
      category: "organization",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd web && npm run test -- src/lib/ai/continuity/promote.test.ts
```

Expected: FAIL because `buildCanonPatchForClaim` does not exist.

- [ ] **Step 3: Add explicit patch builder**

In `web/src/lib/ai/continuity/promote.ts`, export this helper above `applyClaimToCanon`:

```ts
export type CanonPatch =
  | {
      table: "characters";
      id: string;
      field: "wound" | "desire" | "need" | "appearance" | "backstory" | "voice_notes" | "powers";
      value: string;
    }
  | {
      table: "world_elements";
      id: string;
      field: "description";
      value: string;
      category: string | null;
    }
  | {
      table: "relationships";
      id: string;
      field: "current_state" | "arc_notes";
      value: string;
    };

export function buildCanonPatchForClaim(claim: ContinuityClaim): CanonPatch | null {
  const pred = claim.predicate.toLowerCase();
  const obj = claim.object_text.trim();

  if (
    claim.subject_character_id &&
    (claim.kind === "attribute" || claim.kind === "entity_introduction")
  ) {
    if (pred === "fears" || pred === "wound") {
      return { table: "characters", id: claim.subject_character_id, field: "wound", value: obj || pred };
    }
    if (pred === "desire") {
      return { table: "characters", id: claim.subject_character_id, field: "desire", value: obj };
    }
    if (pred === "need") {
      return { table: "characters", id: claim.subject_character_id, field: "need", value: obj };
    }
    if (pred === "appearance") {
      return { table: "characters", id: claim.subject_character_id, field: "appearance", value: obj };
    }
    if (pred === "backstory") {
      return { table: "characters", id: claim.subject_character_id, field: "backstory", value: obj };
    }
    if (pred === "voice" || pred === "voice_notes") {
      return { table: "characters", id: claim.subject_character_id, field: "voice_notes", value: obj };
    }
    if (pred === "powers" || pred === "power") {
      return { table: "characters", id: claim.subject_character_id, field: "powers", value: obj };
    }
    return {
      table: "characters",
      id: claim.subject_character_id,
      field: "voice_notes",
      value: `${claim.predicate}: ${obj}`,
    };
  }

  if (
    claim.subject_world_element_id &&
    (claim.kind === "attribute" ||
      claim.kind === "world_rule" ||
      claim.kind === "entity_introduction")
  ) {
    return {
      table: "world_elements",
      id: claim.subject_world_element_id,
      field: "description",
      value: obj,
      category: claim.proposed_world_category,
    };
  }

  if (claim.subject_relationship_id && claim.kind === "relationship") {
    const statePredicates = new Set(["status", "current_state", "together", "separated"]);
    return {
      table: "relationships",
      id: claim.subject_relationship_id,
      field: statePredicates.has(pred) ? "current_state" : "arc_notes",
      value: `${claim.predicate}: ${obj}`,
    };
  }

  return null;
}
```

- [ ] **Step 4: Refactor `applyClaimToCanon` to use the patch builder**

Keep existing character creation behavior, then replace the character/world update branches with patch handling:

```ts
const patch = buildCanonPatchForClaim(claim);
if (!patch) return;

if (patch.table === "characters") {
  const { data: row } = await supabase
    .from("characters")
    .select("*")
    .eq("id", patch.id)
    .maybeSingle();
  if (!row) return;
  await supabase
    .from("characters")
    .update({ [patch.field]: appendField(row[patch.field] as string | null, patch.value) })
    .eq("id", patch.id);
  return;
}

if (patch.table === "world_elements") {
  const { data: row } = await supabase
    .from("world_elements")
    .select("*")
    .eq("id", patch.id)
    .maybeSingle();
  if (!row) return;
  await supabase
    .from("world_elements")
    .update({
      description: appendField(row.description as string | null, patch.value),
      category: row.category ?? patch.category,
    })
    .eq("id", patch.id);
  return;
}

if (patch.table === "relationships") {
  const { data: row } = await supabase
    .from("relationships")
    .select("*")
    .eq("id", patch.id)
    .maybeSingle();
  if (!row) return;
  await supabase
    .from("relationships")
    .update({ [patch.field]: appendField(row[patch.field] as string | null, patch.value) })
    .eq("id", patch.id);
}
```

- [ ] **Step 5: Run promotion tests**

Run:

```bash
cd web && npm run test -- src/lib/ai/continuity/promote.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/ai/continuity/promote.ts web/src/lib/ai/continuity/promote.test.ts
git commit -m "feat: promote codex claims by destination"
```

---

## Task 6: Server Actions for Selected Review and Merge/Alias Resolution

**Files:**
- Modify: `web/src/app/(app)/chapters/[id]/codex-actions.ts`

- [ ] **Step 1: Add selected reject action**

Add below `confirmClaimIdsAction`:

```ts
export async function rejectClaimIdsAction(
  chapterId: string,
  claimIds: string[],
): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    if (!claimIds.length) return { ok: true, count: 0 };
    const supabase = await supabaseServer();
    const { error } = await supabase
      .from("continuity_claims")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .in("id", claimIds);
    if (error) throw error;
    revalidatePath(`/chapters/${chapterId}`);
    revalidatePath(`/chapters/${chapterId}/codex-review`);
    return { ok: true, count: claimIds.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}
```

- [ ] **Step 2: Make selected confirm return a result**

Change `confirmClaimIdsAction` to:

```ts
export async function confirmClaimIdsAction(
  chapterId: string,
  claimIds: string[],
): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    if (!claimIds.length) return { ok: true, count: 0 };
    const supabase = await supabaseServer();
    await confirmClaims(supabase, claimIds);
    revalidatePath(`/chapters/${chapterId}`);
    revalidatePath(`/chapters/${chapterId}/codex-review`);
    return { ok: true, count: claimIds.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}
```

- [ ] **Step 3: Add resolve-to-character action**

Add:

```ts
export async function resolveClaimsToCharacterAction(input: {
  chapterId: string;
  claimIds: string[];
  characterId: string;
  alias: string | null;
}): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    if (!input.claimIds.length) return { ok: true, count: 0 };
    const supabase = await supabaseServer();

    if (input.alias?.trim()) {
      const { data: character } = await supabase
        .from("characters")
        .select("aliases")
        .eq("id", input.characterId)
        .maybeSingle();
      const aliases = new Set<string>(character?.aliases ?? []);
      aliases.add(input.alias.trim());
      await supabase
        .from("characters")
        .update({ aliases: [...aliases] })
        .eq("id", input.characterId);
    }

    const { error } = await supabase
      .from("continuity_claims")
      .update({
        subject_character_id: input.characterId,
        subject_world_element_id: null,
        subject_relationship_id: null,
        proposed_destination_type: "character",
        resolution_status: "resolved",
        resolution_note: null,
        updated_at: new Date().toISOString(),
      })
      .in("id", input.claimIds);
    if (error) throw error;

    revalidatePath(`/chapters/${input.chapterId}`);
    revalidatePath(`/chapters/${input.chapterId}/codex-review`);
    return { ok: true, count: input.claimIds.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}
```

- [ ] **Step 4: Add resolve-to-world action**

Add:

```ts
export async function resolveClaimsToWorldElementAction(input: {
  chapterId: string;
  claimIds: string[];
  worldElementId: string;
  alias: string | null;
  category: string | null;
}): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    if (!input.claimIds.length) return { ok: true, count: 0 };
    const supabase = await supabaseServer();

    const { data: element } = await supabase
      .from("world_elements")
      .select("aliases, category")
      .eq("id", input.worldElementId)
      .maybeSingle();

    const aliases = new Set<string>(element?.aliases ?? []);
    if (input.alias?.trim()) aliases.add(input.alias.trim());

    await supabase
      .from("world_elements")
      .update({
        aliases: [...aliases],
        category: element?.category ?? input.category,
      })
      .eq("id", input.worldElementId);

    const { error } = await supabase
      .from("continuity_claims")
      .update({
        subject_character_id: null,
        subject_world_element_id: input.worldElementId,
        subject_relationship_id: null,
        proposed_destination_type: "world_element",
        proposed_world_category: input.category,
        resolution_status: "resolved",
        resolution_note: null,
        updated_at: new Date().toISOString(),
      })
      .in("id", input.claimIds);
    if (error) throw error;

    revalidatePath(`/chapters/${input.chapterId}`);
    revalidatePath(`/chapters/${input.chapterId}/codex-review`);
    return { ok: true, count: input.claimIds.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}
```

- [ ] **Step 5: Run lint on actions**

Run:

```bash
cd web && npm run lint -- src/app/\(app\)/chapters/\[id\]/codex-actions.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/\(app\)/chapters/\[id\]/codex-actions.ts
git commit -m "feat: add selected codex review actions"
```

---

## Task 7: Review View Model and Destination Visibility

**Files:**
- Create: `web/src/app/(app)/chapters/[id]/codex-review/codex-review-model.ts`
- Modify: `web/src/app/(app)/chapters/[id]/codex-review/page.tsx`

- [ ] **Step 1: Create review model helper**

Create `web/src/app/(app)/chapters/[id]/codex-review/codex-review-model.ts`:

```ts
import type { ContinuityClaim } from "@/lib/supabase/types";

export type CodexDestinationOption = {
  id: string;
  label: string;
  type: "character" | "world_element" | "relationship";
};

export type CodexReviewRow = ContinuityClaim & {
  scene_label: string;
  destination_label: string;
  confidence_label: "High" | "Medium" | "Low";
};

export function confidenceLabel(confidence: ContinuityClaim["confidence"]) {
  if (confidence === "high") return "High";
  if (confidence === "medium") return "Medium";
  return "Low";
}

export function destinationLabel(input: {
  claim: ContinuityClaim;
  characterNames: Map<string, string>;
  worldNames: Map<string, string>;
  relationshipNames: Map<string, string>;
}): string {
  if (input.claim.subject_character_id) {
    return `Character: ${input.characterNames.get(input.claim.subject_character_id) ?? "Unknown"}`;
  }
  if (input.claim.subject_world_element_id) {
    return `World: ${input.worldNames.get(input.claim.subject_world_element_id) ?? "Unknown"}`;
  }
  if (input.claim.subject_relationship_id) {
    return `Relationship: ${input.relationshipNames.get(input.claim.subject_relationship_id) ?? "Unknown"}`;
  }
  if (input.claim.resolution_status === "candidate" && input.claim.resolution_note) {
    return input.claim.resolution_note;
  }
  if (input.claim.resolution_status === "ambiguous") {
    return "Ambiguous destination";
  }
  return "Unresolved";
}
```

- [ ] **Step 2: Load destination data on the server page**

In `page.tsx`, after claims load, fetch characters/world/relationships for the project:

```ts
const [{ data: characters }, { data: worlds }, { data: relationships }] = await Promise.all([
  supabase
    .from("characters")
    .select("id, name, aliases")
    .eq("project_id", project.id)
    .order("name"),
  supabase
    .from("world_elements")
    .select("id, name, category, aliases")
    .eq("project_id", project.id)
    .order("name"),
  supabase
    .from("relationships")
    .select("id, type, current_state, char_a_id, char_b_id")
    .eq("project_id", project.id),
]);
```

Pass `characters`, `worlds`, and `relationships` into `CodexReviewClient`.

- [ ] **Step 3: Run lint on page**

Run:

```bash
cd web && npm run lint -- src/app/\(app\)/chapters/\[id\]/codex-review/page.tsx src/app/\(app\)/chapters/\[id\]/codex-review/codex-review-model.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/\(app\)/chapters/\[id\]/codex-review/page.tsx web/src/app/\(app\)/chapters/\[id\]/codex-review/codex-review-model.ts
git commit -m "feat: load codex review destinations"
```

---

## Task 8: Selectable Confidence Review UI

**Files:**
- Modify: `web/src/app/(app)/chapters/[id]/codex-review/codex-review-client.tsx`

- [ ] **Step 1: Add props and imports**

Import actions and `Badge`:

```ts
import { Badge } from "@/components/ui/badge";
import {
  acceptHighConfidenceClaimsChapterAction,
  confirmClaimIdsAction,
  rejectAllAutoClaimsChapterAction,
  rejectClaimIdsAction,
  resolveClaimsToCharacterAction,
  resolveClaimsToWorldElementAction,
} from "@/app/(app)/chapters/[id]/codex-actions";
```

Add local types:

```ts
type DestinationOption = {
  id: string;
  name: string | null;
  aliases?: string[] | null;
  category?: string | null;
};
```

Extend props:

```ts
characters,
worlds,
}: {
  chapterId: string;
  chapterTitle: string | null;
  claims: ContinuityClaim[];
  scenes: SceneMin[];
  characters: DestinationOption[];
  worlds: DestinationOption[];
})
```

- [ ] **Step 2: Add selection state and bulk helpers**

Inside the component:

```ts
const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
const [confidenceFilter, setConfidenceFilter] = useState<"all" | "high" | "medium" | "low">("all");

const visibleClaims = useMemo(
  () =>
    claims.filter((c) =>
      confidenceFilter === "all" ? true : c.confidence === confidenceFilter,
    ),
  [claims, confidenceFilter],
);

function selectClaims(nextClaims: ContinuityClaim[]) {
  setSelectedIds(new Set(nextClaims.map((c) => c.id)));
}

function toggleClaim(id: string) {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}
```

- [ ] **Step 3: Add selected confirm/reject handlers**

```ts
function confirmSelected() {
  const ids = [...selectedIds];
  setMsg(null);
  start(async () => {
    const res = await confirmClaimIdsAction(chapterId, ids);
    if (res.ok) {
      setSelectedIds(new Set());
      setMsg(`Promoted ${res.count ?? 0} selected fact(s).`);
      router.refresh();
    } else {
      setMsg(res.error ?? "Failed.");
    }
  });
}

function rejectSelected() {
  const ids = [...selectedIds];
  if (!ids.length) return;
  if (!window.confirm(`Reject ${ids.length} selected claim(s)?`)) return;
  setMsg(null);
  start(async () => {
    const res = await rejectClaimIdsAction(chapterId, ids);
    if (res.ok) {
      setSelectedIds(new Set());
      setMsg(`Rejected ${res.count ?? 0} selected claim(s).`);
      router.refresh();
    } else {
      setMsg(res.error ?? "Failed.");
    }
  });
}
```

- [ ] **Step 4: Add confidence badges and destination text**

Add helper functions:

```ts
function confidenceVariant(confidence: ContinuityClaim["confidence"]) {
  if (confidence === "high") return "default";
  if (confidence === "medium") return "secondary";
  return "outline";
}

function destinationText(claim: ContinuityClaim) {
  if (claim.subject_character_id) {
    const ch = characters.find((c) => c.id === claim.subject_character_id);
    return `Character: ${ch?.name ?? "Unknown"}`;
  }
  if (claim.subject_world_element_id) {
    const w = worlds.find((x) => x.id === claim.subject_world_element_id);
    return `World: ${w?.name ?? "Unknown"}${w?.category ? ` (${w.category})` : ""}`;
  }
  if (claim.subject_relationship_id) return "Relationship";
  if (claim.resolution_note) return claim.resolution_note;
  return "Unresolved";
}
```

In each row, render:

```tsx
<label className="flex gap-3 rounded-md border bg-card px-3 py-2 leading-relaxed">
  <input
    type="checkbox"
    checked={selectedIds.has(c.id)}
    onChange={() => toggleClaim(c.id)}
    className="mt-1"
  />
  <span className="min-w-0 flex-1">
    <span className="flex flex-wrap items-center gap-2">
      <Badge variant={confidenceVariant(c.confidence)}>{c.confidence}</Badge>
      <Badge variant="outline">{c.kind}</Badge>
      <Badge variant="outline">{destinationText(c)}</Badge>
    </span>
    <span className="mt-2 block">
      <span className="font-mono text-xs text-muted-foreground">{c.predicate}</span>{" "}
      → {c.object_text}
    </span>
    <span className="block text-xs text-muted-foreground">
      scene {(sc?.order_index ?? 0) + 1}
      {sc?.title ? ` · ${sc.title}` : ""}
    </span>
  </span>
</label>
```

- [ ] **Step 5: Add toolbar controls**

Above the grouped list, add:

```tsx
<div className="flex flex-wrap gap-2">
  <Button type="button" size="sm" variant="outline" onClick={() => setConfidenceFilter("all")}>
    All
  </Button>
  <Button type="button" size="sm" variant="outline" onClick={() => setConfidenceFilter("high")}>
    High
  </Button>
  <Button type="button" size="sm" variant="outline" onClick={() => selectClaims(claims.filter((c) => c.confidence === "high"))}>
    Select high
  </Button>
  <Button type="button" size="sm" variant="outline" onClick={() => selectClaims(claims.filter((c) => c.confidence !== "low"))}>
    Select medium + high
  </Button>
  <Button type="button" size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>
    Deselect all
  </Button>
  <Button type="button" size="sm" onClick={confirmSelected} disabled={!selectedIds.size}>
    Confirm selected ({selectedIds.size})
  </Button>
  <Button type="button" size="sm" variant="destructive" onClick={rejectSelected} disabled={!selectedIds.size}>
    Reject selected
  </Button>
</div>
```

- [ ] **Step 6: Run lint**

Run:

```bash
cd web && npm run lint -- src/app/\(app\)/chapters/\[id\]/codex-review/codex-review-client.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/\(app\)/chapters/\[id\]/codex-review/codex-review-client.tsx
git commit -m "feat: add selectable codex review"
```

---

## Task 9: Merge/Alias Resolution Controls

**Files:**
- Modify: `web/src/app/(app)/chapters/[id]/codex-review/codex-review-client.tsx`

- [ ] **Step 1: Add resolution form state**

Inside the client component:

```ts
const [targetCharacterId, setTargetCharacterId] = useState("");
const [targetWorldId, setTargetWorldId] = useState("");
const [aliasText, setAliasText] = useState("");
const [worldCategory, setWorldCategory] = useState("");
```

- [ ] **Step 2: Add character merge handler**

```ts
function resolveSelectedToCharacter() {
  const ids = [...selectedIds];
  if (!targetCharacterId || !ids.length) return;
  setMsg(null);
  start(async () => {
    const res = await resolveClaimsToCharacterAction({
      chapterId,
      claimIds: ids,
      characterId: targetCharacterId,
      alias: aliasText.trim() || null,
    });
    if (res.ok) {
      setSelectedIds(new Set());
      setAliasText("");
      setMsg(`Resolved ${res.count ?? 0} claim(s) to character.`);
      router.refresh();
    } else {
      setMsg(res.error ?? "Failed.");
    }
  });
}
```

- [ ] **Step 3: Add world merge handler**

```ts
function resolveSelectedToWorld() {
  const ids = [...selectedIds];
  if (!targetWorldId || !ids.length) return;
  setMsg(null);
  start(async () => {
    const res = await resolveClaimsToWorldElementAction({
      chapterId,
      claimIds: ids,
      worldElementId: targetWorldId,
      alias: aliasText.trim() || null,
      category: worldCategory.trim() || null,
    });
    if (res.ok) {
      setSelectedIds(new Set());
      setAliasText("");
      setWorldCategory("");
      setMsg(`Resolved ${res.count ?? 0} claim(s) to world entry.`);
      router.refresh();
    } else {
      setMsg(res.error ?? "Failed.");
    }
  });
}
```

- [ ] **Step 4: Add resolution panel**

Below the toolbar:

```tsx
<div className="rounded-md border bg-muted/30 p-3">
  <p className="mb-2 text-sm font-medium">Resolve selected claims</p>
  <div className="grid gap-2 md:grid-cols-2">
    <select
      value={targetCharacterId}
      onChange={(e) => setTargetCharacterId(e.target.value)}
      className="rounded-md border bg-background px-2 py-2 text-sm"
    >
      <option value="">Choose character...</option>
      {characters.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
    <Button type="button" size="sm" onClick={resolveSelectedToCharacter} disabled={!selectedIds.size || !targetCharacterId}>
      Merge into character
    </Button>
    <select
      value={targetWorldId}
      onChange={(e) => setTargetWorldId(e.target.value)}
      className="rounded-md border bg-background px-2 py-2 text-sm"
    >
      <option value="">Choose world entry...</option>
      {worlds.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name ?? "Unnamed world entry"}
        </option>
      ))}
    </select>
    <Button type="button" size="sm" onClick={resolveSelectedToWorld} disabled={!selectedIds.size || !targetWorldId}>
      Merge into world
    </Button>
  </div>
  <div className="mt-2 grid gap-2 md:grid-cols-2">
    <input
      value={aliasText}
      onChange={(e) => setAliasText(e.target.value)}
      placeholder="Optional alias to add, e.g. Ava"
      className="rounded-md border bg-background px-2 py-2 text-sm"
    />
    <input
      value={worldCategory}
      onChange={(e) => setWorldCategory(e.target.value)}
      placeholder="Optional world category, e.g. organization"
      className="rounded-md border bg-background px-2 py-2 text-sm"
    />
  </div>
</div>
```

- [ ] **Step 5: Run lint**

Run:

```bash
cd web && npm run lint -- src/app/\(app\)/chapters/\[id\]/codex-review/codex-review-client.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/\(app\)/chapters/\[id\]/codex-review/codex-review-client.tsx
git commit -m "feat: resolve codex claims to aliases"
```

---

## Task 10: Relationship Destination Review

**Files:**
- Modify: `web/src/app/(app)/chapters/[id]/codex-actions.ts`
- Modify: `web/src/app/(app)/chapters/[id]/codex-review/codex-review-client.tsx`

- [ ] **Step 1: Add resolve-to-relationship action**

In `codex-actions.ts`, add:

```ts
export async function resolveClaimsToRelationshipAction(input: {
  chapterId: string;
  claimIds: string[];
  relationshipId: string;
}): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    if (!input.claimIds.length) return { ok: true, count: 0 };
    const supabase = await supabaseServer();
    const { error } = await supabase
      .from("continuity_claims")
      .update({
        subject_character_id: null,
        subject_world_element_id: null,
        subject_relationship_id: input.relationshipId,
        proposed_destination_type: "relationship",
        resolution_status: "resolved",
        resolution_note: null,
        updated_at: new Date().toISOString(),
      })
      .in("id", input.claimIds);
    if (error) throw error;

    revalidatePath(`/chapters/${input.chapterId}`);
    revalidatePath(`/chapters/${input.chapterId}/codex-review`);
    return { ok: true, count: input.claimIds.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}
```

- [ ] **Step 2: Add relationships to client props**

Pass relationship options from `page.tsx` to the client:

```ts
relationships={(relationships ?? []) as {
  id: string;
  type: string | null;
  current_state: string | null;
  char_a_id: string | null;
  char_b_id: string | null;
}[]}
```

Add a client prop:

```ts
relationships: {
  id: string;
  type: string | null;
  current_state: string | null;
  char_a_id: string | null;
  char_b_id: string | null;
}[];
```

- [ ] **Step 3: Add relationship merge controls**

Import `resolveClaimsToRelationshipAction`, add state:

```ts
const [targetRelationshipId, setTargetRelationshipId] = useState("");
```

Add handler:

```ts
function resolveSelectedToRelationship() {
  const ids = [...selectedIds];
  if (!targetRelationshipId || !ids.length) return;
  setMsg(null);
  start(async () => {
    const res = await resolveClaimsToRelationshipAction({
      chapterId,
      claimIds: ids,
      relationshipId: targetRelationshipId,
    });
    if (res.ok) {
      setSelectedIds(new Set());
      setMsg(`Resolved ${res.count ?? 0} claim(s) to relationship.`);
      router.refresh();
    } else {
      setMsg(res.error ?? "Failed.");
    }
  });
}
```

Add relationship select next to character/world controls:

```tsx
<select
  value={targetRelationshipId}
  onChange={(e) => setTargetRelationshipId(e.target.value)}
  className="rounded-md border bg-background px-2 py-2 text-sm"
>
  <option value="">Choose relationship...</option>
  {relationships.map((r) => (
    <option key={r.id} value={r.id}>
      {r.type ?? "Relationship"} {r.current_state ? `- ${r.current_state}` : ""}
    </option>
  ))}
</select>
<Button type="button" size="sm" onClick={resolveSelectedToRelationship} disabled={!selectedIds.size || !targetRelationshipId}>
  Merge into relationship
</Button>
```

- [ ] **Step 4: Run lint**

Run:

```bash
cd web && npm run lint -- src/app/\(app\)/chapters/\[id\]/codex-actions.ts src/app/\(app\)/chapters/\[id\]/codex-review/codex-review-client.tsx src/app/\(app\)/chapters/\[id\]/codex-review/page.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/\(app\)/chapters/\[id\]/codex-actions.ts web/src/app/\(app\)/chapters/\[id\]/codex-review/codex-review-client.tsx web/src/app/\(app\)/chapters/\[id\]/codex-review/page.tsx
git commit -m "feat: resolve codex claims to relationships"
```

---

## Task 11: Relationship Codex Page

**Files:**
- Create: `web/src/app/(app)/relationships/[id]/codex/page.tsx`

- [ ] **Step 1: Create relationship codex route**

Create `web/src/app/(app)/relationships/[id]/codex/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import type { ContinuityClaim } from "@/lib/supabase/types";

export default async function RelationshipCodexPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const supabase = await supabaseServer();
  const { data: rel } = await supabase
    .from("relationships")
    .select("id, type, current_state")
    .eq("id", id)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!rel) notFound();

  const { data: claims } = await supabase
    .from("continuity_claims")
    .select("*")
    .eq("project_id", project.id)
    .eq("subject_relationship_id", id)
    .order("created_at", { ascending: false })
    .limit(80);

  const rows = (claims ?? []) as ContinuityClaim[];
  const byPred = new Map<string, ContinuityClaim[]>();
  for (const c of rows) {
    const arr = byPred.get(c.predicate) ?? [];
    arr.push(c);
    byPred.set(c.predicate, arr);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 md:p-8">
      <Link
        href={`/relationships/${id}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" /> {rel.type ?? "Relationship"}
      </Link>
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Continuity codex
        </p>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          What we know - {rel.type ?? "relationship"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Relationship facts extracted from prose.
        </p>
      </header>

      <div className="space-y-6">
        {byPred.size === 0 ? (
          <p className="text-sm text-muted-foreground">
            No continuity claims linked to this relationship yet.
          </p>
        ) : (
          [...byPred.entries()].map(([pred, list]) => (
            <section key={pred}>
              <h2 className="mb-2 text-sm font-semibold capitalize">{pred}</h2>
              <ul className="space-y-2 text-sm">
                {list.map((c) => (
                  <li key={c.id} className="rounded-md border bg-card px-3 py-2">
                    {c.object_text}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {c.confidence} · {c.status}
                      {c.source_scene_id ? (
                        <>
                          {" "}
                          ·{" "}
                          <Link
                            href={`/scenes/${c.source_scene_id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            scene
                          </Link>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run lint**

Run:

```bash
cd web && npm run lint -- src/app/\(app\)/relationships/\[id\]/codex/page.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/\(app\)/relationships/\[id\]/codex/page.tsx
git commit -m "feat: add relationship codex page"
```

---

## Task 12: End-to-End Verification

**Files:**
- No new files unless verification finds a defect.

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd web && npm run test -- src/lib/ai/continuity/resolve-subject.test.ts src/lib/ai/continuity/resolve-relationship.test.ts src/lib/ai/continuity/promote.test.ts src/lib/ai/continuity/tiering.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
cd web && npm run lint
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run:

```bash
cd web && npm run test
```

Expected: PASS.

- [ ] **Step 4: Manual browser verification**

Start the app:

```bash
cd web && npm run dev
```

Verify in the browser:

1. Open a chapter with pending Codex review claims.
2. Confirm confidence badges are visible.
3. Click `Select high`; only high-confidence rows are checked.
4. Deselect one row and click `Confirm selected`; only selected rows disappear after refresh.
5. Select an unresolved `Ava` row, choose `Ava Larent`, enter alias `Ava`, and merge into character.
6. Confirm the character record now contains alias `Ava`.
7. Select a world claim, choose a world entry, set category, and merge.
8. Confirm the world entry category is set when it was empty.
9. Select a relationship claim, merge into relationship, confirm it appears on the relationship codex page.

- [ ] **Step 5: Commit verification fixes**

If manual verification required changes:

```bash
git add web supabase
git commit -m "fix: polish codex review triage"
```

---

## Self-Review

**Spec coverage:** The plan covers selectable confidence review, destination visibility, merge/alias resolution, world category promotion, and relationship promotion/page visibility.

**Placeholder scan:** No `TBD` or open-ended “add tests later” steps remain. Each code-changing task includes exact file paths, concrete code, and verification commands.

**Type consistency:** New claim fields are introduced in the migration and mirrored in `ContinuityClaim`; later tasks consistently use `proposed_destination_type`, `proposed_world_category`, `resolution_status`, and `resolution_note`.
