# Wiki / Compile Model + Reflections Cache + AI Changelog — Implementation Plan

**Goal:** Move buildabook from "DB rows are the source of truth for world/character facts, enriched by pgvector RAG at query time" to "prose is the source of truth; compiled wiki documents are derivable artifacts; AI reads whole compiled wiki in-context." Add a reflections-table cache to skip regenerating session/chapter summaries when inputs haven't changed, plus an append-only AI changelog.

**Architecture:**
- `wiki_documents` table holds versioned markdown-body "compiled" docs per entity (characters, world elements, relationships, threads index, storyline index). Compilers are deterministic pure functions that read prose + entity rows, hash inputs, and upsert a new `current` row (demoting the previous `current` to `superseded`).
- AI context assembly (`buildContext()`) switches from reading the raw `characters` / `world_elements` / `open_threads` tables to concatenating the current compiled wiki docs.
- Phase 2 RAG (`scene_chunks`, Voyage embeddings, `retrieveRagContinuity`) is retired on the read path; the existing table stays on disk but nothing populates or queries it. Whole-corpus-in-context wins at 30k-word novella scale.
- `reflections` table caches AI-generated summaries keyed by `(project_id, kind, target_id, input_signature)`; session-wrap and chapter-debrief become hits on unchanged inputs.
- `ai_log` table records every AI-triggered state change (compile, reflect, extract) — viewable at `/activity`, exportable as markdown.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), Anthropic SDK, TipTap 3, Vitest. No new dependencies required.

---

## Important context for the engineer

Things that aren't obvious from reading individual files:

- **Next.js 16 has breaking changes from older training data.** Read `node_modules/next/dist/docs/` before writing route handlers or server actions you're unsure about. Heed `web/AGENTS.md`.
- **Single-user / single-project-per-user assumption holds for now.** `getOrCreateProject()` in `web/src/lib/projects.ts` auto-creates on first visit. Every server action follows the pattern: `const project = await getOrCreateProject()` then scope all queries by `project_id`.
- **RLS is the only security layer.** Every new table needs RLS enabled and an `owner` policy. Follow the pattern in `supabase/migrations/0001_init.sql` — `exists (select 1 from projects p where p.id = <table>.project_id and p.user_id = auth.uid())`.
- **AI calls go through `askModel()` (`web/src/lib/ai/model.ts`), which wraps `askClaude()` / `askXai()`.** Every call already writes to `ai_interactions`. When this plan adds new persona tags (`compile_*`, `reflect_*`), they're just strings — the `PersonaKey` union in `web/src/lib/supabase/types.ts` needs the new members added but nothing at the DB layer cares.
- **Migrations have collided once already (`0007_continuity_editor.sql` and `0007_profiles_and_badges.sql`).** We keep going from the highest numbered migration; this plan uses `0010`, `0011`, `0012`.
- **Scene content is HTML stored in `scenes.content`.** Use `stripHtml()` from `web/src/lib/html.ts` to get plaintext. There is no rich mention node yet — character names are counted by regex in `web/src/lib/mentions/chapter-mentions.ts`.
- **There is no mention node in the TipTap editor** (`web/src/components/prose-editor.tsx`). Don't be misled by the folder name `lib/mentions/` — it only does post-save regex name-counting.
- **Tests use Vitest and live next to the code** (`*.test.ts` adjacent). `web/vitest.config.ts` only picks up `src/**/*.test.ts`. Run with `npm test` (from `web/`). The environment is node-only; no jsdom. For DB-adjacent code, write pure functions and test them, don't mock Supabase.
- **Deterministic compile first, LLM enrichment later.** Every compiler in Phase A is a pure function — no Anthropic calls. This keeps wiki regeneration free. A future plan can add an opt-in "enrich" step that uses Claude for voice snapshots.
- **Commit after every task.** Each numbered task ends in a commit step. Frequent small commits.
- **From `web/` directory** for all `npm` commands and test runs. For repo-level paths (migrations), use absolute paths.

---

## Phase A — Wiki schema + compile engine

Introduces `wiki_documents` and the deterministic compilers. At the end of this phase, the app has compiled docs persisted but **AI context still reads from raw tables** (switch happens in Phase B). This phase alone is shippable — compiled wiki is visible under a new `/wiki` page that is read-only.

### Task A1: Add `wiki_documents` migration

**Files:**
- Create: `supabase/migrations/0010_wiki_documents.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Migration 010 — compiled wiki documents (derived artifacts).
--
-- The manuscript + raw entity rows are authoritative inputs. A compiled wiki
-- doc is the regenerable output of a deterministic function over those inputs.
-- Versioned via status='current' | 'superseded'; prior `current` gets demoted
-- atomically on compile.

create table if not exists wiki_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  doc_type text not null check (doc_type in (
    'character', 'world', 'relationship', 'thread', 'storyline', 'index'
  )),
  doc_key text not null,
  version int not null default 1,
  status text not null default 'current' check (status in ('current', 'superseded')),
  title text,
  body_md text not null default '',
  source_signature text,
  source_refs jsonb not null default '{}'::jsonb,
  model text,
  compiled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists wiki_documents_current_uq
  on wiki_documents (project_id, doc_type, doc_key)
  where status = 'current';

create index if not exists wiki_documents_project_idx
  on wiki_documents (project_id);

create index if not exists wiki_documents_doc_idx
  on wiki_documents (project_id, doc_type, doc_key, version desc);

alter table wiki_documents enable row level security;

drop policy if exists wiki_documents_owner on wiki_documents;
create policy wiki_documents_owner on wiki_documents for all using (
  exists (select 1 from projects p where p.id = wiki_documents.project_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from projects p where p.id = wiki_documents.project_id and p.user_id = auth.uid())
);
```

- [ ] **Step 2: Apply to staging, verify no errors**

Run from the repo root:

```bash
supabase db push --project-ref "$BAB_STAGING_REF"
```

Expected: "Finished supabase db push." with the new migration listed.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0010_wiki_documents.sql
git commit -m "db: add wiki_documents table for compiled artifacts"
```

### Task A2: Add TypeScript types for wiki documents

**Files:**
- Modify: `web/src/lib/supabase/types.ts`

- [ ] **Step 1: Append the type**

Add at the end of `web/src/lib/supabase/types.ts`:

```ts
export type WikiDocType =
  | "character"
  | "world"
  | "relationship"
  | "thread"
  | "storyline"
  | "index";

export type WikiDocument = {
  id: string;
  project_id: string;
  doc_type: WikiDocType;
  doc_key: string;
  version: number;
  status: "current" | "superseded";
  title: string | null;
  body_md: string;
  source_signature: string | null;
  source_refs: Record<string, unknown>;
  model: string | null;
  compiled_at: string;
  created_at: string;
};
```

Also extend the `PersonaKey` union near the top of the file to include compile and reflect tags:

```ts
export type PersonaKey =
  | "partner"
  | "profiler"
  | "specialist"
  | "proofreader"
  | "analyst"
  | "extract"
  | "factcheck"
  | "continuity_editor"
  | "compile_character"
  | "compile_world"
  | "compile_relationship"
  | "compile_index"
  | "reflect_session"
  | "reflect_chapter"
  | "reflect_story_so_far";
```

- [ ] **Step 2: Typecheck passes**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/supabase/types.ts
git commit -m "types: add WikiDocument + compile/reflect persona keys"
```

### Task A3: Build the signature + slug utilities

**Files:**
- Create: `web/src/lib/wiki/signature.ts`
- Create: `web/src/lib/wiki/signature.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// web/src/lib/wiki/signature.test.ts
import { describe, expect, it } from "vitest";
import { computeSignature, entitySlug } from "./signature";

describe("computeSignature", () => {
  it("is stable across key order", () => {
    const a = computeSignature({ a: 1, b: [1, 2], c: { nested: true } });
    const b = computeSignature({ c: { nested: true }, b: [1, 2], a: 1 });
    expect(a).toEqual(b);
  });

  it("changes when a value changes", () => {
    const a = computeSignature({ x: "hello" });
    const b = computeSignature({ x: "world" });
    expect(a).not.toEqual(b);
  });

  it("returns a 64-char hex string", () => {
    const sig = computeSignature({ any: "thing" });
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("entitySlug", () => {
  it("kebab-cases latin names", () => {
    expect(entitySlug("Mara O'Neil")).toBe("mara-o-neil");
  });

  it("collapses whitespace", () => {
    expect(entitySlug("  the  High  Council  ")).toBe("the-high-council");
  });

  it("falls back to a deterministic token for empty input", () => {
    expect(entitySlug("")).toBe("untitled");
    expect(entitySlug(null)).toBe("untitled");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd web && npm test -- --run signature
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// web/src/lib/wiki/signature.ts
import { createHash } from "node:crypto";

/** Stable SHA-256 over any JSON-serializable input (keys sorted recursively). */
export function computeSignature(input: unknown): string {
  const canonical = stableStringify(input);
  return createHash("sha256").update(canonical).digest("hex");
}

/** Kebab-case slug used as `doc_key` for non-UUID-keyed docs (threads index etc). */
export function entitySlug(name: string | null | undefined): string {
  const raw = (name ?? "").trim().toLowerCase();
  const cleaned = raw
    .replace(/['`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length ? cleaned : "untitled";
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd web && npm test -- --run signature
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/wiki/signature.ts web/src/lib/wiki/signature.test.ts
git commit -m "wiki: add signature + slug utilities with tests"
```

### Task A4: Write the wiki-document repository

**Files:**
- Create: `web/src/lib/wiki/repo.ts`

Pure persistence helpers. Service layer uses these; compilers stay I/O-free.

- [ ] **Step 1: Implement**

```ts
// web/src/lib/wiki/repo.ts
import { supabaseServer } from "@/lib/supabase/server";
import type { WikiDocType, WikiDocument } from "@/lib/supabase/types";

export type CompiledDoc = {
  title: string;
  bodyMd: string;
  sourceSignature: string;
  sourceRefs: Record<string, unknown>;
};

export async function getCurrentDoc(
  projectId: string,
  docType: WikiDocType,
  docKey: string,
): Promise<WikiDocument | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("wiki_documents")
    .select("*")
    .eq("project_id", projectId)
    .eq("doc_type", docType)
    .eq("doc_key", docKey)
    .eq("status", "current")
    .maybeSingle();
  return (data as WikiDocument) ?? null;
}

export async function listCurrentDocs(
  projectId: string,
  docType?: WikiDocType,
): Promise<WikiDocument[]> {
  const supabase = await supabaseServer();
  let q = supabase
    .from("wiki_documents")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "current");
  if (docType) q = q.eq("doc_type", docType);
  const { data } = await q.order("doc_type").order("doc_key");
  return (data ?? []) as WikiDocument[];
}

export type UpsertResult = { action: "skipped" | "inserted"; id: string };

/** Atomically demote old `current` and insert a fresh `current` when the signature changed. */
export async function upsertDoc(
  projectId: string,
  docType: WikiDocType,
  docKey: string,
  doc: CompiledDoc,
  model: string | null,
): Promise<UpsertResult> {
  const supabase = await supabaseServer();
  const existing = await getCurrentDoc(projectId, docType, docKey);

  if (existing && existing.source_signature === doc.sourceSignature) {
    return { action: "skipped", id: existing.id };
  }

  if (existing) {
    const { error: demoteErr } = await supabase
      .from("wiki_documents")
      .update({ status: "superseded" })
      .eq("id", existing.id);
    if (demoteErr) throw demoteErr;
  }

  const nextVersion = (existing?.version ?? 0) + 1;
  const { data, error } = await supabase
    .from("wiki_documents")
    .insert({
      project_id: projectId,
      doc_type: docType,
      doc_key: docKey,
      version: nextVersion,
      status: "current",
      title: doc.title,
      body_md: doc.bodyMd,
      source_signature: doc.sourceSignature,
      source_refs: doc.sourceRefs,
      model,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { action: "inserted", id: data.id };
}
```

- [ ] **Step 2: Typecheck passes**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/wiki/repo.ts
git commit -m "wiki: add repo helpers with superseded-versioning upsert"
```

### Task A5: Write the character compiler

**Files:**
- Create: `web/src/lib/wiki/compilers/character.ts`
- Create: `web/src/lib/wiki/compilers/character.test.ts`

Deterministic template — no LLM call. Reads the character row plus every scene that mentions it, produces a markdown dossier.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/wiki/compilers/character.test.ts
import { describe, expect, it } from "vitest";
import { compileCharacter, type CompileCharacterInput } from "./character";

const baseInput: CompileCharacterInput = {
  character: {
    id: "c-1",
    project_id: "p-1",
    name: "Mara Locke",
    role: "protagonist",
    species: "human",
    archetype: "reluctant chosen one",
    appearance: "lean, dark hair",
    backstory: "Lost her sister at twelve.",
    wound: "Abandonment.",
    desire: "Safety.",
    need: "Belonging.",
    voice_notes: "Clipped; sparing with adjectives.",
    powers: null,
    aliases: ["Mar"],
    created_at: "2026-04-01T00:00:00Z",
  },
  appearances: [
    {
      scene_id: "s-1",
      chapter_id: "ch-1",
      chapter_order: 0,
      scene_order: 0,
      chapter_title: "Arrival",
      goal: "Meet the envoy.",
      conflict: "Envoy refuses.",
      outcome: "Bargain.",
    },
    {
      scene_id: "s-2",
      chapter_id: "ch-1",
      chapter_order: 0,
      scene_order: 1,
      chapter_title: "Arrival",
      goal: null,
      conflict: null,
      outcome: null,
    },
  ],
  relationships: [
    { other_name: "Kade", type: "love interest", current_state: "wary" },
  ],
  beats: [
    { title: "Meet cute", act: 1, why_it_matters: "Sets the hook." },
  ],
};

describe("compileCharacter", () => {
  it("produces a markdown body that includes name, role, voice, appearances", () => {
    const out = compileCharacter(baseInput);
    expect(out.title).toBe("Mara Locke");
    expect(out.bodyMd).toContain("# Mara Locke");
    expect(out.bodyMd).toContain("protagonist");
    expect(out.bodyMd).toContain("Clipped");
    expect(out.bodyMd).toContain("Arrival");
    expect(out.bodyMd).toContain("Kade");
  });

  it("signature is stable across equal inputs", () => {
    const a = compileCharacter(baseInput);
    const b = compileCharacter({ ...baseInput });
    expect(a.sourceSignature).toEqual(b.sourceSignature);
  });

  it("signature changes when an appearance is added", () => {
    const a = compileCharacter(baseInput);
    const b = compileCharacter({
      ...baseInput,
      appearances: [
        ...baseInput.appearances,
        {
          scene_id: "s-3",
          chapter_id: "ch-2",
          chapter_order: 1,
          scene_order: 0,
          chapter_title: "Descent",
          goal: null,
          conflict: null,
          outcome: null,
        },
      ],
    });
    expect(a.sourceSignature).not.toEqual(b.sourceSignature);
  });

  it("tolerates missing optional fields", () => {
    const thin = compileCharacter({
      character: {
        ...baseInput.character,
        role: null,
        archetype: null,
        appearance: null,
        voice_notes: null,
        wound: null,
        desire: null,
        need: null,
        aliases: [],
        backstory: null,
      },
      appearances: [],
      relationships: [],
      beats: [],
    });
    expect(thin.bodyMd).toContain("# Mara Locke");
    expect(thin.bodyMd).not.toContain("undefined");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd web && npm test -- --run character
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// web/src/lib/wiki/compilers/character.ts
import type { CompiledDoc } from "@/lib/wiki/repo";
import { computeSignature } from "@/lib/wiki/signature";
import type { Character } from "@/lib/supabase/types";

export type CharacterAppearance = {
  scene_id: string;
  chapter_id: string;
  chapter_order: number;
  scene_order: number;
  chapter_title: string | null;
  goal: string | null;
  conflict: string | null;
  outcome: string | null;
};

export type CharacterRelation = {
  other_name: string;
  type: string | null;
  current_state: string | null;
};

export type CharacterBeatLink = {
  title: string;
  act: number | null;
  why_it_matters: string | null;
};

export type CompileCharacterInput = {
  character: Character;
  appearances: CharacterAppearance[];
  relationships: CharacterRelation[];
  beats: CharacterBeatLink[];
};

export function compileCharacter(input: CompileCharacterInput): CompiledDoc {
  const { character: c, appearances, relationships, beats } = input;

  const orderedAppearances = [...appearances].sort(
    (a, b) =>
      a.chapter_order - b.chapter_order || a.scene_order - b.scene_order,
  );

  const lines: string[] = [];
  lines.push(`# ${c.name || "Untitled"}`);
  lines.push("");

  const meta: string[] = [];
  if (c.role) meta.push(`**Role:** ${c.role}`);
  if (c.species) meta.push(`**Species:** ${c.species}`);
  if (c.archetype) meta.push(`**Archetype:** ${c.archetype}`);
  if (c.aliases?.length) meta.push(`**Also known as:** ${c.aliases.join(", ")}`);
  if (meta.length) {
    lines.push(meta.join("  "));
    lines.push("");
  }

  if (c.appearance) {
    lines.push("## Appearance");
    lines.push(c.appearance);
    lines.push("");
  }

  const drives: string[] = [];
  if (c.wound) drives.push(`- **Wound:** ${c.wound}`);
  if (c.desire) drives.push(`- **Desire:** ${c.desire}`);
  if (c.need) drives.push(`- **Need:** ${c.need}`);
  if (drives.length) {
    lines.push("## Drives");
    lines.push(...drives);
    lines.push("");
  }

  if (c.voice_notes) {
    lines.push("## Voice");
    lines.push(c.voice_notes);
    lines.push("");
  }

  if (c.backstory) {
    lines.push("## Backstory");
    lines.push(c.backstory);
    lines.push("");
  }

  if (c.powers) {
    lines.push("## Powers");
    lines.push(c.powers);
    lines.push("");
  }

  if (relationships.length) {
    lines.push("## Relationships");
    for (const r of relationships) {
      const t = r.type ? ` — ${r.type}` : "";
      const state = r.current_state ? ` (${r.current_state})` : "";
      lines.push(`- [[${r.other_name}]]${t}${state}`);
    }
    lines.push("");
  }

  if (beats.length) {
    lines.push("## Beats this character anchors");
    for (const b of beats) {
      const act = b.act ? ` (Act ${b.act})` : "";
      const why = b.why_it_matters ? ` — ${b.why_it_matters}` : "";
      lines.push(`- ${b.title}${act}${why}`);
    }
    lines.push("");
  }

  if (orderedAppearances.length) {
    lines.push("## Appearances");
    for (const a of orderedAppearances) {
      const title = a.chapter_title || `Chapter ${a.chapter_order + 1}`;
      const goal = a.goal ? ` goal: ${a.goal}` : "";
      const conflict = a.conflict ? ` · conflict: ${a.conflict}` : "";
      const outcome = a.outcome ? ` · outcome: ${a.outcome}` : "";
      lines.push(`- ${title}${goal}${conflict}${outcome}`);
    }
    lines.push("");
  }

  const signaturePayload = {
    character: {
      id: c.id,
      name: c.name,
      role: c.role,
      species: c.species,
      archetype: c.archetype,
      appearance: c.appearance,
      backstory: c.backstory,
      wound: c.wound,
      desire: c.desire,
      need: c.need,
      voice_notes: c.voice_notes,
      powers: c.powers,
      aliases: [...(c.aliases ?? [])].sort(),
    },
    appearances: orderedAppearances.map((a) => ({
      scene_id: a.scene_id,
      chapter_id: a.chapter_id,
      chapter_order: a.chapter_order,
      scene_order: a.scene_order,
      goal: a.goal,
      conflict: a.conflict,
      outcome: a.outcome,
    })),
    relationships: [...relationships].sort((a, b) =>
      a.other_name.localeCompare(b.other_name),
    ),
    beats: [...beats].sort((a, b) => a.title.localeCompare(b.title)),
  };

  return {
    title: c.name || "Untitled",
    bodyMd: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n",
    sourceSignature: computeSignature(signaturePayload),
    sourceRefs: {
      character_id: c.id,
      scene_ids: orderedAppearances.map((a) => a.scene_id),
    },
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd web && npm test -- --run character
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/wiki/compilers/character.ts web/src/lib/wiki/compilers/character.test.ts
git commit -m "wiki: deterministic character compiler"
```

### Task A6: Write the world-element compiler

**Files:**
- Create: `web/src/lib/wiki/compilers/world.ts`
- Create: `web/src/lib/wiki/compilers/world.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/wiki/compilers/world.test.ts
import { describe, expect, it } from "vitest";
import { compileWorldElement, type CompileWorldInput } from "./world";

const baseInput: CompileWorldInput = {
  element: {
    id: "w-1",
    project_id: "p-1",
    category: "magic_rule",
    name: "Mating Bonds",
    description: "A lifetime telepathic link between two fated partners.",
    metadata: { severity: "high" },
    aliases: ["bond", "fated link"],
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  },
  citations: [
    {
      scene_id: "s-1",
      chapter_id: "ch-1",
      chapter_order: 0,
      scene_order: 0,
      chapter_title: "Arrival",
      mention_count: 3,
    },
  ],
};

describe("compileWorldElement", () => {
  it("renders category, description, aliases, citations", () => {
    const out = compileWorldElement(baseInput);
    expect(out.title).toBe("Mating Bonds");
    expect(out.bodyMd).toContain("# Mating Bonds");
    expect(out.bodyMd).toContain("magic_rule");
    expect(out.bodyMd).toContain("fated link");
    expect(out.bodyMd).toContain("Arrival");
  });

  it("stable signature over equal inputs", () => {
    const a = compileWorldElement(baseInput);
    const b = compileWorldElement({ ...baseInput });
    expect(a.sourceSignature).toEqual(b.sourceSignature);
  });

  it("signature differs when metadata changes", () => {
    const a = compileWorldElement(baseInput);
    const b = compileWorldElement({
      ...baseInput,
      element: { ...baseInput.element, metadata: { severity: "low" } },
    });
    expect(a.sourceSignature).not.toEqual(b.sourceSignature);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd web && npm test -- --run world
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// web/src/lib/wiki/compilers/world.ts
import type { CompiledDoc } from "@/lib/wiki/repo";
import { computeSignature } from "@/lib/wiki/signature";
import type { WorldElement } from "@/lib/supabase/types";

export type WorldCitation = {
  scene_id: string;
  chapter_id: string;
  chapter_order: number;
  scene_order: number;
  chapter_title: string | null;
  mention_count: number;
};

export type CompileWorldInput = {
  element: WorldElement;
  citations: WorldCitation[];
};

export function compileWorldElement(input: CompileWorldInput): CompiledDoc {
  const { element: w, citations } = input;

  const orderedCitations = [...citations].sort(
    (a, b) =>
      a.chapter_order - b.chapter_order || a.scene_order - b.scene_order,
  );

  const lines: string[] = [];
  lines.push(`# ${w.name || "Untitled element"}`);
  lines.push("");

  const meta: string[] = [];
  if (w.category) meta.push(`**Category:** ${w.category}`);
  if (w.aliases?.length) meta.push(`**Also known as:** ${w.aliases.join(", ")}`);
  if (meta.length) {
    lines.push(meta.join("  "));
    lines.push("");
  }

  if (w.description) {
    lines.push(w.description);
    lines.push("");
  }

  const metadataEntries = Object.entries(w.metadata ?? {});
  if (metadataEntries.length) {
    lines.push("## Facts");
    for (const [k, v] of metadataEntries.sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`- **${k}:** ${String(v)}`);
    }
    lines.push("");
  }

  if (orderedCitations.length) {
    lines.push("## Cited in");
    for (const c of orderedCitations) {
      const title = c.chapter_title || `Chapter ${c.chapter_order + 1}`;
      const times = c.mention_count > 1 ? ` (×${c.mention_count})` : "";
      lines.push(`- ${title}${times}`);
    }
    lines.push("");
  }

  const signaturePayload = {
    element: {
      id: w.id,
      name: w.name,
      category: w.category,
      description: w.description,
      aliases: [...(w.aliases ?? [])].sort(),
      metadata: w.metadata ?? {},
    },
    citations: orderedCitations.map((c) => ({
      scene_id: c.scene_id,
      chapter_id: c.chapter_id,
      chapter_order: c.chapter_order,
      scene_order: c.scene_order,
      mention_count: c.mention_count,
    })),
  };

  return {
    title: w.name || "Untitled element",
    bodyMd: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n",
    sourceSignature: computeSignature(signaturePayload),
    sourceRefs: {
      world_element_id: w.id,
      scene_ids: orderedCitations.map((c) => c.scene_id),
    },
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd web && npm test -- --run world
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/wiki/compilers/world.ts web/src/lib/wiki/compilers/world.test.ts
git commit -m "wiki: deterministic world-element compiler"
```

### Task A7: Write the relationship compiler

**Files:**
- Create: `web/src/lib/wiki/compilers/relationship.ts`
- Create: `web/src/lib/wiki/compilers/relationship.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/wiki/compilers/relationship.test.ts
import { describe, expect, it } from "vitest";
import { compileRelationship } from "./relationship";

describe("compileRelationship", () => {
  it("renders the arc and intensity curve", () => {
    const out = compileRelationship({
      relationship: {
        id: "r-1",
        project_id: "p-1",
        char_a_id: "a-1",
        char_b_id: "b-1",
        type: "mates",
        current_state: "bonded",
        arc_notes: "Slow burn to bond.",
        created_at: "2026-04-01T00:00:00Z",
      },
      charA: { id: "a-1", name: "Mara" },
      charB: { id: "b-1", name: "Kade" },
      beats: [
        {
          chapter_order: 0,
          scene_order: 0,
          chapter_title: "Arrival",
          beat_label: "first spark",
          intensity: 2,
          notes: "Eyes meet.",
        },
        {
          chapter_order: 1,
          scene_order: 0,
          chapter_title: "Descent",
          beat_label: "rupture",
          intensity: -3,
          notes: "Secret revealed.",
        },
      ],
    });

    expect(out.title).toBe("Mara × Kade");
    expect(out.bodyMd).toContain("# Mara × Kade");
    expect(out.bodyMd).toContain("[[Mara]]");
    expect(out.bodyMd).toContain("[[Kade]]");
    expect(out.bodyMd).toContain("first spark");
    expect(out.bodyMd).toContain("+2");
    expect(out.bodyMd).toContain("-3");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd web && npm test -- --run relationship
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// web/src/lib/wiki/compilers/relationship.ts
import type { CompiledDoc } from "@/lib/wiki/repo";
import { computeSignature } from "@/lib/wiki/signature";
import type { Relationship } from "@/lib/supabase/types";

export type RelationshipBeatLink = {
  chapter_order: number;
  scene_order: number;
  chapter_title: string | null;
  beat_label: string | null;
  intensity: number | null;
  notes: string | null;
};

export type CompileRelationshipInput = {
  relationship: Relationship;
  charA: { id: string; name: string } | null;
  charB: { id: string; name: string } | null;
  beats: RelationshipBeatLink[];
};

export function compileRelationship(
  input: CompileRelationshipInput,
): CompiledDoc {
  const { relationship: r, charA, charB, beats } = input;

  const aName = charA?.name ?? "Unknown";
  const bName = charB?.name ?? "Unknown";
  const title = `${aName} × ${bName}`;

  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`- **A:** [[${aName}]]`);
  lines.push(`- **B:** [[${bName}]]`);
  if (r.type) lines.push(`- **Type:** ${r.type}`);
  if (r.current_state) lines.push(`- **Current state:** ${r.current_state}`);
  lines.push("");

  if (r.arc_notes) {
    lines.push("## Arc");
    lines.push(r.arc_notes);
    lines.push("");
  }

  const ordered = [...beats].sort(
    (a, b) =>
      a.chapter_order - b.chapter_order || a.scene_order - b.scene_order,
  );

  if (ordered.length) {
    lines.push("## Intensity curve");
    for (const b of ordered) {
      const chTitle = b.chapter_title || `Chapter ${b.chapter_order + 1}`;
      const intensity = typeof b.intensity === "number"
        ? ` [${b.intensity >= 0 ? "+" : ""}${b.intensity}]`
        : "";
      const label = b.beat_label ? ` — ${b.beat_label}` : "";
      const note = b.notes ? ` · ${b.notes}` : "";
      lines.push(`- ${chTitle}${intensity}${label}${note}`);
    }
    lines.push("");
  }

  const signaturePayload = {
    relationship: {
      id: r.id,
      type: r.type,
      current_state: r.current_state,
      arc_notes: r.arc_notes,
      char_a_id: r.char_a_id,
      char_b_id: r.char_b_id,
    },
    a_name: aName,
    b_name: bName,
    beats: ordered.map((b) => ({
      chapter_order: b.chapter_order,
      scene_order: b.scene_order,
      beat_label: b.beat_label,
      intensity: b.intensity,
      notes: b.notes,
    })),
  };

  return {
    title,
    bodyMd: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n",
    sourceSignature: computeSignature(signaturePayload),
    sourceRefs: {
      relationship_id: r.id,
      char_a_id: r.char_a_id,
      char_b_id: r.char_b_id,
    },
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd web && npm test -- --run relationship
```

Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/wiki/compilers/relationship.ts web/src/lib/wiki/compilers/relationship.test.ts
git commit -m "wiki: relationship compiler with intensity curve"
```

### Task A8: Write the threads and storyline index compilers

**Files:**
- Create: `web/src/lib/wiki/compilers/indexes.ts`
- Create: `web/src/lib/wiki/compilers/indexes.test.ts`

Both threads and storyline are project-scoped singletons (`doc_key = 'threads'` / `'storyline'`).

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/wiki/compilers/indexes.test.ts
import { describe, expect, it } from "vitest";
import { compileThreadsIndex, compileStorylineIndex } from "./indexes";

describe("compileThreadsIndex", () => {
  it("separates open and resolved threads", () => {
    const out = compileThreadsIndex({
      threads: [
        {
          id: "t-1",
          question: "Who sent the letter?",
          resolved: false,
          opened_chapter_title: "Arrival",
          resolved_chapter_title: null,
        },
        {
          id: "t-2",
          question: "Was the envoy lying?",
          resolved: true,
          opened_chapter_title: "Arrival",
          resolved_chapter_title: "Descent",
        },
      ],
    });

    expect(out.title).toBe("Open threads");
    expect(out.bodyMd).toContain("## Open");
    expect(out.bodyMd).toContain("Who sent the letter?");
    expect(out.bodyMd).toContain("## Resolved");
    expect(out.bodyMd).toContain("Was the envoy lying?");
  });
});

describe("compileStorylineIndex", () => {
  it("renders chapters and beats in order", () => {
    const out = compileStorylineIndex({
      chapters: [
        {
          id: "ch-1",
          title: "Arrival",
          order: 0,
          status: "done",
          wordcount: 3200,
          synopsis: "Mara meets the envoy.",
          scenes: [
            { id: "s-1", title: "Gate", order: 0, goal: "Enter.", status: "done" },
            { id: "s-2", title: "Bargain", order: 1, goal: null, status: "done" },
          ],
        },
        {
          id: "ch-2",
          title: "Descent",
          order: 1,
          status: "drafting",
          wordcount: 800,
          synopsis: null,
          scenes: [],
        },
      ],
      beats: [
        { title: "Meet cute", act: 1, why_it_matters: "Hook." },
      ],
    });

    expect(out.bodyMd).toContain("# Storyline");
    expect(out.bodyMd).toContain("Arrival");
    expect(out.bodyMd).toContain("Descent");
    expect(out.bodyMd).toContain("Meet cute");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd web && npm test -- --run indexes
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// web/src/lib/wiki/compilers/indexes.ts
import type { CompiledDoc } from "@/lib/wiki/repo";
import { computeSignature } from "@/lib/wiki/signature";

export type ThreadRow = {
  id: string;
  question: string;
  resolved: boolean;
  opened_chapter_title: string | null;
  resolved_chapter_title: string | null;
};

export function compileThreadsIndex(input: {
  threads: ThreadRow[];
}): CompiledDoc {
  const open = input.threads.filter((t) => !t.resolved);
  const resolved = input.threads.filter((t) => t.resolved);

  const lines: string[] = [];
  lines.push("# Open threads");
  lines.push("");

  lines.push("## Open");
  if (open.length === 0) {
    lines.push("- (none)");
  } else {
    for (const t of open) {
      const where = t.opened_chapter_title
        ? ` — opened in ${t.opened_chapter_title}`
        : "";
      lines.push(`- ${t.question}${where}`);
    }
  }
  lines.push("");

  lines.push("## Resolved");
  if (resolved.length === 0) {
    lines.push("- (none)");
  } else {
    for (const t of resolved) {
      const opened = t.opened_chapter_title
        ? ` — opened in ${t.opened_chapter_title}`
        : "";
      const closed = t.resolved_chapter_title
        ? `, resolved in ${t.resolved_chapter_title}`
        : "";
      lines.push(`- ${t.question}${opened}${closed}`);
    }
  }

  const payload = {
    threads: [...input.threads].sort((a, b) => a.id.localeCompare(b.id)),
  };

  return {
    title: "Open threads",
    bodyMd: lines.join("\n").trim() + "\n",
    sourceSignature: computeSignature(payload),
    sourceRefs: { thread_ids: input.threads.map((t) => t.id) },
  };
}

export type StorylineChapter = {
  id: string;
  title: string | null;
  order: number;
  status: string;
  wordcount: number;
  synopsis: string | null;
  scenes: Array<{
    id: string;
    title: string | null;
    order: number;
    goal: string | null;
    status: string;
  }>;
};

export type StorylineBeat = {
  title: string;
  act: number | null;
  why_it_matters: string | null;
};

export function compileStorylineIndex(input: {
  chapters: StorylineChapter[];
  beats: StorylineBeat[];
}): CompiledDoc {
  const chapters = [...input.chapters].sort((a, b) => a.order - b.order);
  const beats = [...input.beats];

  const lines: string[] = [];
  lines.push("# Storyline");
  lines.push("");

  if (beats.length) {
    lines.push("## Beats");
    for (const b of beats) {
      const act = b.act ? ` (Act ${b.act})` : "";
      const why = b.why_it_matters ? ` — ${b.why_it_matters}` : "";
      lines.push(`- ${b.title}${act}${why}`);
    }
    lines.push("");
  }

  lines.push("## Chapters");
  for (const ch of chapters) {
    const title = ch.title || `Chapter ${ch.order + 1}`;
    lines.push(
      `### ${title} · ${ch.status} · ${ch.wordcount} words`,
    );
    if (ch.synopsis) lines.push(ch.synopsis);
    const scenes = [...ch.scenes].sort((a, b) => a.order - b.order);
    for (const s of scenes) {
      const stitle = s.title || `Scene ${s.order + 1}`;
      const goal = s.goal ? ` — ${s.goal}` : "";
      lines.push(`- ${stitle} (${s.status})${goal}`);
    }
    lines.push("");
  }

  const payload = {
    chapters: chapters.map((c) => ({
      id: c.id,
      title: c.title,
      order: c.order,
      status: c.status,
      wordcount: c.wordcount,
      synopsis: c.synopsis,
      scenes: [...c.scenes].sort((a, b) => a.order - b.order),
    })),
    beats,
  };

  return {
    title: "Storyline",
    bodyMd: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n",
    sourceSignature: computeSignature(payload),
    sourceRefs: {
      chapter_ids: chapters.map((c) => c.id),
    },
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd web && npm test -- --run indexes
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/wiki/compilers/indexes.ts web/src/lib/wiki/compilers/indexes.test.ts
git commit -m "wiki: threads + storyline index compilers"
```

### Task A9: Build the compile orchestrator

**Files:**
- Create: `web/src/lib/wiki/compile.ts`

Reads all needed data for a project, runs every compiler, writes results via `upsertDoc`, returns a summary of changes.

- [ ] **Step 1: Implement**

```ts
// web/src/lib/wiki/compile.ts
import { compileCharacter } from "@/lib/wiki/compilers/character";
import { compileRelationship } from "@/lib/wiki/compilers/relationship";
import {
  compileStorylineIndex,
  compileThreadsIndex,
  type StorylineChapter,
} from "@/lib/wiki/compilers/indexes";
import { compileWorldElement } from "@/lib/wiki/compilers/world";
import { upsertDoc } from "@/lib/wiki/repo";
import { supabaseServer } from "@/lib/supabase/server";
import type {
  Beat,
  Character,
  OpenThread,
  Relationship,
  Scene,
  WorldElement,
} from "@/lib/supabase/types";

type ChapterRow = {
  id: string;
  title: string | null;
  order_index: number | null;
  status: string;
  wordcount: number;
  synopsis: string | null;
};

type SceneRow = Pick<
  Scene,
  | "id"
  | "chapter_id"
  | "order_index"
  | "title"
  | "goal"
  | "conflict"
  | "outcome"
  | "status"
>;

type CharMentionRow = {
  character_id: string;
  chapter_id: string;
  scene_id: string | null;
  mention_count: number;
};

type ElementMentionRow = {
  element_id: string;
  chapter_id: string;
  scene_id: string | null;
  mention_count: number;
};

type RelationshipBeatRow = {
  relationship_id: string;
  chapter_id: string | null;
  scene_id: string | null;
  beat_label: string | null;
  intensity: number | null;
  notes: string | null;
};

export type CompileReport = {
  characters: { inserted: number; skipped: number };
  world: { inserted: number; skipped: number };
  relationships: { inserted: number; skipped: number };
  threads: "inserted" | "skipped";
  storyline: "inserted" | "skipped";
};

export async function compileProjectWiki(
  projectId: string,
): Promise<CompileReport> {
  const supabase = await supabaseServer();

  const [
    { data: characters },
    { data: worldRows },
    { data: threads },
    { data: relationships },
    { data: beats },
    { data: chapters },
    { data: scenes },
    { data: charMentions },
    { data: elMentions },
    { data: relBeats },
  ] = await Promise.all([
    supabase.from("characters").select("*").eq("project_id", projectId),
    supabase.from("world_elements").select("*").eq("project_id", projectId),
    supabase.from("open_threads").select("*").eq("project_id", projectId),
    supabase.from("relationships").select("*").eq("project_id", projectId),
    supabase.from("beats").select("*").eq("project_id", projectId).order("order_index"),
    supabase
      .from("chapters")
      .select("id,title,order_index,status,wordcount,synopsis")
      .eq("project_id", projectId)
      .order("order_index"),
    supabase
      .from("scenes")
      .select("id,chapter_id,order_index,title,goal,conflict,outcome,status")
      .order("order_index"),
    supabase.from("character_mentions").select("*"),
    supabase.from("element_mentions").select("*"),
    supabase.from("relationship_beats").select("*"),
  ]);

  const chars = (characters ?? []) as Character[];
  const worldEls = (worldRows ?? []) as WorldElement[];
  const threadRows = (threads ?? []) as OpenThread[];
  const rels = (relationships ?? []) as Relationship[];
  const beatRows = (beats ?? []) as Beat[];
  const chapterRows = (chapters ?? []) as ChapterRow[];
  const sceneRows = (scenes ?? []) as SceneRow[];
  const charMentionRows = (charMentions ?? []) as CharMentionRow[];
  const elMentionRows = (elMentions ?? []) as ElementMentionRow[];
  const relBeatRows = (relBeats ?? []) as RelationshipBeatRow[];

  const chapterById = new Map(chapterRows.map((c) => [c.id, c]));
  const scenesByChapter = new Map<string, SceneRow[]>();
  for (const s of sceneRows) {
    const arr = scenesByChapter.get(s.chapter_id) ?? [];
    arr.push(s);
    scenesByChapter.set(s.chapter_id, arr);
  }
  const scenesById = new Map(sceneRows.map((s) => [s.id, s]));

  const charById = new Map(chars.map((c) => [c.id, c]));
  const elById = new Map(worldEls.map((w) => [w.id, w]));

  const report: CompileReport = {
    characters: { inserted: 0, skipped: 0 },
    world: { inserted: 0, skipped: 0 },
    relationships: { inserted: 0, skipped: 0 },
    threads: "skipped",
    storyline: "skipped",
  };

  // CHARACTERS ---------------------------------------------------------------
  for (const c of chars) {
    const appearances = charMentionRows
      .filter((m) => m.character_id === c.id)
      .map((m) => {
        const chapter = chapterById.get(m.chapter_id);
        return {
          scene_id: m.scene_id ?? "",
          chapter_id: m.chapter_id,
          chapter_order: chapter?.order_index ?? 0,
          scene_order: 0,
          chapter_title: chapter?.title ?? null,
          goal: null,
          conflict: null,
          outcome: null,
        };
      });

    const charRels = rels
      .filter((r) => r.char_a_id === c.id || r.char_b_id === c.id)
      .map((r) => {
        const otherId = r.char_a_id === c.id ? r.char_b_id : r.char_a_id;
        const other = otherId ? charById.get(otherId) : null;
        return {
          other_name: other?.name ?? "Unknown",
          type: r.type,
          current_state: r.current_state,
        };
      });

    const compiled = compileCharacter({
      character: c,
      appearances,
      relationships: charRels,
      beats: beatRows.map((b) => ({
        title: b.title,
        act: b.act,
        why_it_matters: b.why_it_matters,
      })),
    });

    const res = await upsertDoc(projectId, "character", c.id, compiled, null);
    if (res.action === "inserted") report.characters.inserted++;
    else report.characters.skipped++;
  }

  // WORLD --------------------------------------------------------------------
  for (const w of worldEls) {
    const citations = elMentionRows
      .filter((m) => m.element_id === w.id)
      .map((m) => {
        const chapter = chapterById.get(m.chapter_id);
        return {
          scene_id: m.scene_id ?? "",
          chapter_id: m.chapter_id,
          chapter_order: chapter?.order_index ?? 0,
          scene_order: 0,
          chapter_title: chapter?.title ?? null,
          mention_count: m.mention_count,
        };
      });

    const compiled = compileWorldElement({ element: w, citations });
    const res = await upsertDoc(projectId, "world", w.id, compiled, null);
    if (res.action === "inserted") report.world.inserted++;
    else report.world.skipped++;
  }

  // RELATIONSHIPS ------------------------------------------------------------
  for (const r of rels) {
    const aId = r.char_a_id;
    const bId = r.char_b_id;
    const a = aId ? charById.get(aId) : null;
    const b = bId ? charById.get(bId) : null;

    const beatsForRel = relBeatRows
      .filter((rb) => rb.relationship_id === r.id)
      .map((rb) => {
        const chapter = rb.chapter_id ? chapterById.get(rb.chapter_id) : null;
        const scene = rb.scene_id ? scenesById.get(rb.scene_id) : null;
        return {
          chapter_order: chapter?.order_index ?? 0,
          scene_order: scene?.order_index ?? 0,
          chapter_title: chapter?.title ?? null,
          beat_label: rb.beat_label,
          intensity: rb.intensity,
          notes: rb.notes,
        };
      });

    const compiled = compileRelationship({
      relationship: r,
      charA: a ? { id: a.id, name: a.name } : null,
      charB: b ? { id: b.id, name: b.name } : null,
      beats: beatsForRel,
    });

    const res = await upsertDoc(projectId, "relationship", r.id, compiled, null);
    if (res.action === "inserted") report.relationships.inserted++;
    else report.relationships.skipped++;
  }

  // THREADS ------------------------------------------------------------------
  const threadRowsView = threadRows.map((t) => ({
    id: t.id,
    question: t.question,
    resolved: t.resolved,
    opened_chapter_title:
      (t.opened_in_chapter_id
        ? chapterById.get(t.opened_in_chapter_id)?.title
        : null) ?? null,
    resolved_chapter_title:
      (t.resolved_in_chapter_id
        ? chapterById.get(t.resolved_in_chapter_id)?.title
        : null) ?? null,
  }));
  const threadsDoc = compileThreadsIndex({ threads: threadRowsView });
  const threadsRes = await upsertDoc(
    projectId,
    "index",
    "threads",
    threadsDoc,
    null,
  );
  report.threads = threadsRes.action === "inserted" ? "inserted" : "skipped";

  // STORYLINE ----------------------------------------------------------------
  const storylineChapters: StorylineChapter[] = chapterRows.map((c) => ({
    id: c.id,
    title: c.title,
    order: c.order_index ?? 0,
    status: c.status,
    wordcount: c.wordcount,
    synopsis: c.synopsis,
    scenes: (scenesByChapter.get(c.id) ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      order: s.order_index ?? 0,
      goal: s.goal,
      status: s.status,
    })),
  }));
  const storylineDoc = compileStorylineIndex({
    chapters: storylineChapters,
    beats: beatRows.map((b) => ({
      title: b.title,
      act: b.act,
      why_it_matters: b.why_it_matters,
    })),
  });
  const storylineRes = await upsertDoc(
    projectId,
    "index",
    "storyline",
    storylineDoc,
    null,
  );
  report.storyline = storylineRes.action === "inserted" ? "inserted" : "skipped";

  return report;
}
```

- [ ] **Step 2: Typecheck passes**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/wiki/compile.ts
git commit -m "wiki: orchestrator compiles characters/world/relationships/indexes"
```

### Task A10: Server action to trigger a manual compile

**Files:**
- Create: `web/src/lib/wiki/actions.ts`

- [ ] **Step 1: Implement**

```ts
// web/src/lib/wiki/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { compileProjectWiki, type CompileReport } from "@/lib/wiki/compile";
import { getOrCreateProject } from "@/lib/projects";

export async function runCompileProjectWiki(): Promise<CompileReport> {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const report = await compileProjectWiki(project.id);
  revalidatePath("/wiki");
  return report;
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/wiki/actions.ts
git commit -m "wiki: server action to trigger full project compile"
```

### Task A11: Read-only wiki browser UI

**Files:**
- Create: `web/src/app/(app)/wiki/page.tsx`
- Create: `web/src/app/(app)/wiki/[docKey]/page.tsx`
- Create: `web/src/app/(app)/wiki/compile-button.tsx`

Minimal UI: list current docs grouped by type, click to read the markdown body rendered as `<pre>` (deliberately crude; polish in a later plan). "Recompile" button calls the server action.

- [ ] **Step 1: Implement the list page**

```tsx
// web/src/app/(app)/wiki/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { listCurrentDocs } from "@/lib/wiki/repo";
import { getOrCreateProject } from "@/lib/projects";
import { CompileButton } from "./compile-button";

export const dynamic = "force-dynamic";

export default async function WikiPage() {
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const docs = await listCurrentDocs(project.id);
  const byType = new Map<string, typeof docs>();
  for (const d of docs) {
    const arr = byType.get(d.doc_type) ?? [];
    arr.push(d);
    byType.set(d.doc_type, arr);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Compiled wiki
          </p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">
            Wiki
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Derived markdown summaries of every character, world element,
            relationship and storyline index. Regenerated whenever you compile.
          </p>
        </div>
        <CompileButton />
      </header>

      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No compiled docs yet. Run a compile.
        </p>
      ) : (
        <div className="space-y-6">
          {[...byType.entries()].map(([type, list]) => (
            <section key={type}>
              <h2 className="mb-2 text-sm font-semibold capitalize">{type}</h2>
              <ul className="space-y-1 text-sm">
                {list.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/wiki/${encodeURIComponent(d.doc_key)}?type=${d.doc_type}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {d.title || d.doc_key}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">
                      v{d.version}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement the detail page**

```tsx
// web/src/app/(app)/wiki/[docKey]/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentDoc } from "@/lib/wiki/repo";
import { getOrCreateProject } from "@/lib/projects";
import type { WikiDocType } from "@/lib/supabase/types";

const VALID_TYPES: WikiDocType[] = [
  "character",
  "world",
  "relationship",
  "thread",
  "storyline",
  "index",
];

export default async function WikiDocPage({
  params,
  searchParams,
}: {
  params: Promise<{ docKey: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const { docKey } = await params;
  const { type } = await searchParams;
  const docType = (type as WikiDocType) ?? "character";
  if (!VALID_TYPES.includes(docType)) notFound();

  const doc = await getCurrentDoc(project.id, docType, decodeURIComponent(docKey));
  if (!doc) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6 md:p-8">
      <Link
        href="/wiki"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" /> Wiki
      </Link>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          {doc.title || doc.doc_key}
        </h1>
        <span className="text-xs text-muted-foreground">
          {doc.doc_type} · v{doc.version} · compiled{" "}
          {new Date(doc.compiled_at).toLocaleString()}
        </span>
      </div>
      <pre className="whitespace-pre-wrap rounded-md border bg-card p-4 text-sm leading-relaxed">
        {doc.body_md}
      </pre>
    </div>
  );
}
```

- [ ] **Step 3: Implement the compile button (client component)**

```tsx
// web/src/app/(app)/wiki/compile-button.tsx
"use client";

import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runCompileProjectWiki } from "@/lib/wiki/actions";

export function CompileButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await runCompileProjectWiki();
        })
      }
      className="gap-1"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      Recompile
    </Button>
  );
}
```

- [ ] **Step 4: Smoke-test in the browser**

Run `npm run dev` (already running per terminal 1), log in, visit `/wiki`, click "Recompile". Confirm characters and world elements show up with body_md rendered.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/\(app\)/wiki
git commit -m "wiki: read-only browser UI with manual recompile"
```

### Task A12: Wire compile into the post-save scene pipeline

**Files:**
- Modify: `web/src/lib/ai/post-save-scene.ts`

Add a project compile after mentions are rolled up.

- [ ] **Step 1: Modify `post-save-scene.ts`**

Replace the whole body of `firePostSaveScenePipeline`:

```ts
// web/src/lib/ai/post-save-scene.ts
import { extractContinuity } from "@/lib/ai/continuity/extract";
import { maybeProposeRelationshipBeat } from "@/lib/ai/relationship-beat-proposal";
import {
  recountChapterCharacterMentions,
  recountChapterElementMentions,
} from "@/lib/mentions/chapter-mentions";
import { compileProjectWiki } from "@/lib/wiki/compile";
import { supabaseServer } from "@/lib/supabase/server";

/** Non-blocking hooks after prose save (mentions, continuity, wiki compile). */
export function firePostSaveScenePipeline(sceneId: string): void {
  void (async () => {
    try {
      const supabase = await supabaseServer();
      const { data: sc } = await supabase
        .from("scenes")
        .select("chapter_id")
        .eq("id", sceneId)
        .maybeSingle();
      const chapterId = sc?.chapter_id;
      if (!chapterId) return;

      await recountChapterCharacterMentions(chapterId);
      await recountChapterElementMentions(chapterId);
      await maybeProposeRelationshipBeat(sceneId);
      await extractContinuity(sceneId);

      const { data: ch } = await supabase
        .from("chapters")
        .select("project_id")
        .eq("id", chapterId)
        .maybeSingle();
      if (ch?.project_id) {
        await compileProjectWiki(ch.project_id);
      }
    } catch (e) {
      console.error("post-save scene pipeline:", e);
    }
  })();
}
```

Note: `rebuildSceneChunks` is intentionally removed in this edit. `scene_chunks` table remains in place but no longer receives new rows; Task B3 makes this explicit.

- [ ] **Step 2: Typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/ai/post-save-scene.ts
git commit -m "wiki: compile project wiki after scene save"
```

---

## Phase B — Switch AI context to compiled wiki; retire RAG

At the end of Phase A, the compile pipeline runs but AI persona calls still read raw tables. Phase B flips the read path.

### Task B1: Extend `ContextBundle` to accept pre-compiled wiki

**Files:**
- Modify: `web/src/lib/ai/context.ts`

- [ ] **Step 1: Extend `buildContext()` to prefer wiki docs**

Add an optional `wikiDocs` field. When present, it replaces the character / world / threads sections of the bundle:

Add this after the existing `ContextBundle` type:

```ts
export type WikiDocForContext = {
  doc_type: "character" | "world" | "relationship" | "thread" | "storyline" | "index";
  doc_key: string;
  title: string | null;
  body_md: string;
};
```

Extend the `ContextBundle` type with:

```ts
  /** If present, used INSTEAD of raw characters/worldElements/openThreads. */
  wikiDocs?: WikiDocForContext[];
```

Modify the body of `buildContext()` — replace the blocks that render `CHARACTERS IN SCOPE`, `WORLD FACTS IN SCOPE`, and `OPEN THREADS` with a branch:

```ts
  if (bundle.wikiDocs?.length) {
    const byType = new Map<string, WikiDocForContext[]>();
    for (const d of bundle.wikiDocs) {
      const arr = byType.get(d.doc_type) ?? [];
      arr.push(d);
      byType.set(d.doc_type, arr);
    }

    const storyline = byType.get("index")?.find((d) => d.doc_key === "storyline");
    if (storyline) {
      lines.push("STORYLINE (compiled)");
      lines.push(storyline.body_md.trim());
      lines.push("");
    }

    const chars = byType.get("character") ?? [];
    if (chars.length) {
      lines.push("CHARACTERS (compiled)");
      for (const d of chars) {
        lines.push(d.body_md.trim());
        lines.push("");
      }
    }

    const world = byType.get("world") ?? [];
    if (world.length) {
      lines.push("WORLD (compiled)");
      for (const d of world) {
        lines.push(d.body_md.trim());
        lines.push("");
      }
    }

    const rels = byType.get("relationship") ?? [];
    if (rels.length) {
      lines.push("RELATIONSHIPS (compiled)");
      for (const d of rels) {
        lines.push(d.body_md.trim());
        lines.push("");
      }
    }

    const threads = byType.get("index")?.find((d) => d.doc_key === "threads");
    if (threads) {
      lines.push("OPEN THREADS (do not contradict; may pay off)");
      lines.push(threads.body_md.trim());
      lines.push("");
    }
  } else {
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
  }
```

- [ ] **Step 2: Typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/ai/context.ts
git commit -m "wiki: buildContext can consume compiled wiki docs"
```

### Task B2: Switch `askPersona` to load wiki docs

**Files:**
- Modify: `web/src/lib/ai/ask.ts`

- [ ] **Step 1: Replace the raw-table read block with a wiki read**

Replace the `Promise.all` that reads characters/world/threads plus the `ragContinuity` block. Final `ask.ts`:

```ts
"use server";

import { supabaseServer } from "@/lib/supabase/server";
import { type CorePersonaKey, getPersonas } from "@/lib/ai/personas";
import {
  askModel,
  resolveModelFromProject,
} from "@/lib/ai/model";
import { parseWritingProfile } from "@/lib/deployment/writing-profile";
import { buildContext } from "@/lib/ai/context";
import { fetchContinuityFactsForScene } from "@/lib/ai/continuity/context-block";
import { listCurrentDocs } from "@/lib/wiki/repo";
import { env } from "@/lib/env";
import { getOrCreateProject } from "@/lib/projects";
import type {
  Beat,
  Character,
  OpenThread,
  Project,
  Scene,
  StyleSample,
  WorldElement,
} from "@/lib/supabase/types";

type AskInput = {
  personaKey: CorePersonaKey;
  userPrompt: string;
  sceneId?: string | null;
  chapterId?: string | null;
  beatId?: string | null;
};

export async function askPersona(input: AskInput): Promise<{
  ok: boolean;
  text?: string;
  error?: string;
}> {
  try {
    const project = await getOrCreateProject();
    if (!project) return { ok: false, error: "No project." };

    const personas = getPersonas(parseWritingProfile(project.writing_profile));
    const persona = personas[input.personaKey];
    if (!persona) return { ok: false, error: "Unknown persona." };

    const supabase = await supabaseServer();

    const [
      { data: samples },
      { data: tropes },
      wikiDocsAll,
    ] = await Promise.all([
      supabase.from("style_samples").select("*").eq("project_id", project.id),
      supabase
        .from("project_tropes")
        .select("trope")
        .eq("project_id", project.id),
      listCurrentDocs(project.id),
    ]);

    const wikiDocs = wikiDocsAll.map((d) => ({
      doc_type: d.doc_type,
      doc_key: d.doc_key,
      title: d.title,
      body_md: d.body_md,
    }));

    let currentScene: Scene | null = null;
    let currentChapterTitle: string | null = null;
    let currentBeat: Beat | null = null;

    if (input.sceneId) {
      const { data: scene } = await supabase
        .from("scenes")
        .select("*")
        .eq("id", input.sceneId)
        .maybeSingle();
      if (scene) currentScene = scene as Scene;
      if (scene) {
        const { data: ch } = await supabase
          .from("chapters")
          .select("title")
          .eq("id", scene.chapter_id)
          .maybeSingle();
        currentChapterTitle = ch?.title ?? null;
      }
    } else if (input.chapterId) {
      const { data: ch } = await supabase
        .from("chapters")
        .select("*")
        .eq("id", input.chapterId)
        .maybeSingle();
      if (ch) currentChapterTitle = ch.title;
    }

    if (input.beatId) {
      const { data: b } = await supabase
        .from("beats")
        .select("*")
        .eq("id", input.beatId)
        .maybeSingle();
      if (b) currentBeat = b as Beat;
    } else if (currentScene && currentScene.beat_ids?.length) {
      const { data: b } = await supabase
        .from("beats")
        .select("*")
        .eq("id", currentScene.beat_ids[0])
        .maybeSingle();
      if (b) currentBeat = b as Beat;
    }

    let continuityFacts: string | null = null;
    if (input.sceneId && env.continuityEditorEnabled()) {
      continuityFacts = await fetchContinuityFactsForScene(
        supabase,
        project.id,
        currentScene?.content ?? null,
      );
    }

    const system = buildContext({
      project: project as Project,
      tropes: (tropes ?? []).map((t) => t.trope),
      characters: [] as Character[],
      worldElements: [] as WorldElement[],
      openThreads: [] as OpenThread[],
      styleSamples: (samples ?? []) as StyleSample[],
      currentBeat,
      currentChapterTitle,
      currentScene,
      continuityFacts,
      wikiDocs,
    });

    const model = resolveModelFromProject(
      project.writing_profile,
      persona.model,
    );
    const directive = `\n\n---\n\n${persona.directive}`;
    const fullSystem = system + directive;

    const { text } = await askModel({
      persona: persona.key,
      system: fullSystem,
      user: input.userPrompt,
      model,
      temperature: persona.temperature,
      maxTokens: persona.maxTokens,
      projectId: project.id,
      writingProfile: parseWritingProfile(project.writing_profile),
      contextType: input.sceneId
        ? "scene"
        : input.chapterId
          ? "chapter"
          : input.beatId
            ? "beat"
            : "freeform",
      contextId: input.sceneId ?? input.chapterId ?? input.beatId ?? null,
    });

    return { ok: true, text };
  } catch (err) {
    console.error("askPersona failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Request failed.",
    };
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Smoke-test the change**

Start dev server (already running). In the app, open a scene and ask Partner for a draft. Verify response is coherent and includes character names. Spot-check `ai_interactions` most-recent row in Supabase — the `prompt` should no longer contain raw `CHARACTERS IN SCOPE` / `WORLD FACTS IN SCOPE` blocks; it should contain `CHARACTERS (compiled)` etc.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/ai/ask.ts
git commit -m "wiki: askPersona reads compiled wiki instead of raw tables"
```

### Task B3: Retire RAG from read path

**Files:**
- Modify: `web/src/lib/ai/rag.ts`
- Modify: `web/src/lib/env.ts` (the `aiReady` check, if it gates on Voyage)

- [ ] **Step 1: Make `retrieveRagContinuity` a no-op stub**

Replace `web/src/lib/ai/rag.ts` entirely:

```ts
/**
 * Retired in favor of compiled wiki context (see web/src/lib/wiki/).
 * Retained as a no-op so any stale imports keep compiling while we migrate.
 * Remove once grep confirms no remaining callers.
 */
export async function retrieveRagContinuity(_args: {
  projectId: string;
  excludeSceneId: string | null;
  queryText: string;
  limit?: number;
}): Promise<string | null> {
  return null;
}
```

- [ ] **Step 2: Grep for remaining callers**

```bash
cd web && npx rg "retrieveRagContinuity|rebuildSceneChunks|voyageEmbed" src
```

Expected output: only the stub definitions, no real callers. If any `retrieveRagContinuity` or `rebuildSceneChunks` callsites remain, remove those lines.

- [ ] **Step 3: Check Voyage key is no longer a hard requirement**

Read `web/src/lib/env.ts` and `web/src/lib/ai/voyage.ts`. If `aiReady()` gates on `VOYAGE_API_KEY`, relax that requirement (wiki-context path does not need embeddings).

- [ ] **Step 4: Typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/ai/rag.ts web/src/lib/env.ts
git commit -m "rag: retire retrieval on read path; wiki supersedes it"
```

### Task B4: Mark `scene_chunks` + `voyage.ts` as deprecated

**Files:**
- Modify: `web/src/lib/ai/voyage.ts` (JSDoc)
- Modify: `web/src/lib/ai/scene-chunks.ts` (JSDoc)

Do not delete yet. Data still lives in the DB; a future cleanup migration can drop the table.

- [ ] **Step 1: Add a header comment to each file**

Add this at the top of both files:

```ts
/**
 * @deprecated Phase 2 RAG is retired in favor of compiled wiki context.
 * This module is kept for historical data; no new code should import it.
 * A future cleanup migration may drop the `scene_chunks` table entirely.
 */
```

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/ai/voyage.ts web/src/lib/ai/scene-chunks.ts
git commit -m "rag: mark scene_chunks + voyage helpers as deprecated"
```

---

## Phase C — Reflections cache

Adds the `reflections` table and rewires session-wrap + chapter-debrief to hit it.

### Task C1: `reflections` migration

**Files:**
- Create: `supabase/migrations/0011_reflections.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 011 — cached AI reflections (session wrap, chapter debrief, etc).
--
-- Keyed by (project_id, kind, target_id) with an input_signature that gates
-- regeneration: on a fresh request, compute the signature over the inputs and
-- skip the AI call if it matches what produced the current row.

create table if not exists reflections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null,
  target_id uuid,
  body text not null default '',
  input_signature text not null,
  model text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10, 4),
  ai_interaction_id uuid references ai_interactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists reflections_project_kind_uq
  on reflections (project_id, kind)
  where target_id is null;

create unique index if not exists reflections_project_kind_target_uq
  on reflections (project_id, kind, target_id)
  where target_id is not null;

create index if not exists reflections_project_idx on reflections (project_id);

drop trigger if exists reflections_updated_at on reflections;
create trigger reflections_updated_at before update on reflections
  for each row execute function set_updated_at();

alter table reflections enable row level security;

drop policy if exists reflections_owner on reflections;
create policy reflections_owner on reflections for all using (
  exists (select 1 from projects p where p.id = reflections.project_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from projects p where p.id = reflections.project_id and p.user_id = auth.uid())
);
```

- [ ] **Step 2: Apply to staging**

```bash
supabase db push --project-ref "$BAB_STAGING_REF"
```

Expected: migration applied.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0011_reflections.sql
git commit -m "db: reflections table for cached AI summaries"
```

### Task C2: Add `Reflection` type

**Files:**
- Modify: `web/src/lib/supabase/types.ts`

- [ ] **Step 1: Append the type**

```ts
export type Reflection = {
  id: string;
  project_id: string;
  kind: string;
  target_id: string | null;
  body: string;
  input_signature: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  ai_interaction_id: string | null;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/supabase/types.ts
git commit -m "types: add Reflection"
```

### Task C3: Reflections service helper

**Files:**
- Create: `web/src/lib/ai/reflections.ts`
- Create: `web/src/lib/ai/reflections.test.ts`

A `getOrGenerateReflection` helper that pure-functionally computes a signature, reads the cached row, and only generates when the signature doesn't match. Generator and signature computation are passed in.

- [ ] **Step 1: Write the failing test for the signature-skip logic**

```ts
// web/src/lib/ai/reflections.test.ts
import { describe, expect, it, vi } from "vitest";
import { runReflection } from "./reflections";

describe("runReflection pure logic", () => {
  it("skips generation when signatures match", async () => {
    const generator = vi.fn();
    const out = await runReflection({
      existing: {
        id: "r-1",
        body: "cached body",
        input_signature: "abc",
      },
      newSignature: "abc",
      generate: generator,
    });
    expect(generator).not.toHaveBeenCalled();
    expect(out.hit).toBe(true);
    expect(out.body).toBe("cached body");
  });

  it("calls generator when signature changed", async () => {
    const generator = vi.fn().mockResolvedValue({
      body: "fresh body",
      model: "test-model",
      inputTokens: 10,
      outputTokens: 20,
      costUsd: 0.001,
      aiInteractionId: null,
    });
    const out = await runReflection({
      existing: {
        id: "r-1",
        body: "stale body",
        input_signature: "old",
      },
      newSignature: "new",
      generate: generator,
    });
    expect(generator).toHaveBeenCalledOnce();
    expect(out.hit).toBe(false);
    expect(out.body).toBe("fresh body");
  });

  it("calls generator when nothing cached", async () => {
    const generator = vi.fn().mockResolvedValue({
      body: "first body",
      model: null,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      aiInteractionId: null,
    });
    const out = await runReflection({
      existing: null,
      newSignature: "first",
      generate: generator,
    });
    expect(generator).toHaveBeenCalledOnce();
    expect(out.hit).toBe(false);
    expect(out.body).toBe("first body");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd web && npm test -- --run reflections
```

Expected: FAIL.

- [ ] **Step 3: Implement the helper**

```ts
// web/src/lib/ai/reflections.ts
import { supabaseServer } from "@/lib/supabase/server";
import type { Reflection } from "@/lib/supabase/types";

export type GenerateReflectionResult = {
  body: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  aiInteractionId: string | null;
};

export type RunReflectionArgs = {
  existing: Pick<Reflection, "id" | "body" | "input_signature"> | null;
  newSignature: string;
  generate: () => Promise<GenerateReflectionResult>;
};

export type RunReflectionResult = {
  hit: boolean;
  body: string;
  generated?: GenerateReflectionResult;
};

/** Pure logic isolated for testing: should we call the generator? */
export async function runReflection(
  args: RunReflectionArgs,
): Promise<RunReflectionResult> {
  if (args.existing && args.existing.input_signature === args.newSignature) {
    return { hit: true, body: args.existing.body };
  }
  const generated = await args.generate();
  return { hit: false, body: generated.body, generated };
}

export async function getOrGenerateReflection(args: {
  projectId: string;
  kind: string;
  targetId: string | null;
  newSignature: string;
  generate: () => Promise<GenerateReflectionResult>;
}): Promise<string> {
  const supabase = await supabaseServer();

  let existingQuery = supabase
    .from("reflections")
    .select("id, body, input_signature")
    .eq("project_id", args.projectId)
    .eq("kind", args.kind);
  existingQuery = args.targetId
    ? existingQuery.eq("target_id", args.targetId)
    : existingQuery.is("target_id", null);

  const { data: existing } = await existingQuery.maybeSingle();

  const result = await runReflection({
    existing: (existing as Reflection | null) ?? null,
    newSignature: args.newSignature,
    generate: args.generate,
  });

  if (result.hit) return result.body;

  const g = result.generated!;

  if (existing) {
    await supabase
      .from("reflections")
      .update({
        body: g.body,
        input_signature: args.newSignature,
        model: g.model,
        input_tokens: g.inputTokens,
        output_tokens: g.outputTokens,
        cost_usd: g.costUsd,
        ai_interaction_id: g.aiInteractionId,
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("reflections").insert({
      project_id: args.projectId,
      kind: args.kind,
      target_id: args.targetId,
      body: g.body,
      input_signature: args.newSignature,
      model: g.model,
      input_tokens: g.inputTokens,
      output_tokens: g.outputTokens,
      cost_usd: g.costUsd,
      ai_interaction_id: g.aiInteractionId,
    });
  }

  return g.body;
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd web && npm test -- --run reflections
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/ai/reflections.ts web/src/lib/ai/reflections.test.ts
git commit -m "reflections: add cache helper with TDD signature logic"
```

### Task C4: Rewire session wrap to use the cache

**Files:**
- Modify: `web/src/app/(app)/session-actions.ts`

The session-wrap signature should include: scene id, scene wordcount, scene goal/conflict/outcome, scene content hash (normalized), writer note. Cache kind = `session_wrap`; target_id = scene id.

- [ ] **Step 1: Modify `wrapWritingSession`**

Rewrite the function (top of file imports + the function body):

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import {
  aiReadyForWritingProfile,
  askModel,
  resolveModelFromProject,
} from "@/lib/ai/model";
import { getPersonas } from "@/lib/ai/personas";
import { parseWritingProfile } from "@/lib/deployment/writing-profile";
import { getOrCreateProject } from "@/lib/projects";
import { getOrGenerateReflection } from "@/lib/ai/reflections";
import { loadSpine, pickCurrentScene, type SpineData } from "@/lib/spine";
import type { Scene } from "@/lib/supabase/types";
import { supabaseServer } from "@/lib/supabase/server";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function sessionSignaturePayload(
  scene: Scene | null,
  writerNote: string | null,
): string {
  if (!scene) return JSON.stringify({ scene: null, writerNote });
  const plain = stripHtml(scene.content ?? "");
  return JSON.stringify({
    sceneId: scene.id,
    wordcount: scene.wordcount ?? 0,
    goal: scene.goal,
    conflict: scene.conflict,
    outcome: scene.outcome,
    proseHash: createHash("sha256").update(plain).digest("hex"),
    writerNote,
  });
}

function buildWrapPrompt(spine: SpineData, scene: Scene | null): string {
  const chapter = scene
    ? spine.chapters.find((c) => c.id === scene.chapter_id)
    : null;
  const beatTitles =
    scene?.beat_ids
      ?.map((id) => spine.beats.find((b) => b.id === id)?.title)
      .filter(Boolean)
      .join(", ") ?? "";

  const prose =
    scene?.content && scene.content.trim()
      ? stripHtml(scene.content).slice(0, 900)
      : "";

  const lines = [
    `Scene: ${scene?.title?.trim() || "(untitled)"}`,
    chapter &&
      `Chapter: ${chapter.title?.trim() || `Chapter ${(chapter.order_index ?? 0) + 1}`}`,
    scene && `Words in scene: ${scene.wordcount ?? 0}`,
    beatTitles && `Beats tagged: ${beatTitles}`,
    scene?.goal && `Goal: ${scene.goal}`,
    scene?.conflict && `Conflict: ${scene.conflict}`,
    scene?.outcome && `Outcome: ${scene.outcome}`,
    prose && `Latest draft excerpt:\n${prose}`,
  ].filter(Boolean);

  return lines.join("\n");
}

function fallbackSummary(spine: SpineData, scene: Scene | null): string {
  if (!scene)
    return "You stepped away from the manuscript — open a scene when you’re ready to continue.";
  const chapter = spine.chapters.find((c) => c.id === scene.chapter_id);
  const chLabel =
    chapter?.title?.trim() ||
    `Chapter ${(chapter?.order_index ?? 0) + 1}`;
  const scLabel =
    scene.title?.trim() ||
    `Scene ${(scene.order_index ?? 0) + 1}`;
  const words = scene.wordcount ?? 0;
  return `Last focus: ${scLabel} in ${chLabel} (${words} words). Continue when you’re ready.`;
}

export async function wrapWritingSession(writerNoteRaw: string) {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");

  const writerNote = writerNoteRaw.trim() || null;

  const spine = await loadSpine(project.id);
  const scene = pickCurrentScene(spine);

  const wp = parseWritingProfile(project.writing_profile);
  const signature = createHash("sha256")
    .update(sessionSignaturePayload(scene, writerNote))
    .digest("hex");

  let summaryText = fallbackSummary(spine, scene);

  if (aiReadyForWritingProfile(wp)) {
    try {
      summaryText = await getOrGenerateReflection({
        projectId: project.id,
        kind: "session_wrap",
        targetId: scene?.id ?? null,
        newSignature: signature,
        generate: async () => {
          const user = buildWrapPrompt(spine, scene);
          const profiler = getPersonas(wp).profiler;
          const model = resolveModelFromProject(project.writing_profile, "quick");
          const result = await askModel({
            persona: "reflect_session",
            system: `${profiler.directive}\n\nFor THIS task only: ignore questions. Reply with exactly two sentences in past tense. Summarize what the writer worked on this session and where the story stands (scene goal/tension). No headings, bullets, or greeting.`,
            user: `Session wrap for continuity dashboard:\n\n${user}`,
            model,
            temperature: 0.35,
            maxTokens: 220,
            projectId: project.id,
            contextType: "session_wrap",
            contextId: scene?.id ?? null,
            writingProfile: wp,
          });
          const t = result.text.trim().replace(/\s+/g, " ");
          return {
            body: t.length > 20 ? t : fallbackSummary(spine, scene),
            model,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costUsd: result.costUsd,
            aiInteractionId: null,
          };
        },
      });
    } catch (e) {
      console.error("session wrap AI failed:", e);
    }
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.from("sessions").insert({
    project_id: project.id,
    summary: summaryText,
    writer_note: writerNote,
    last_scene_id: scene?.id ?? null,
    last_action: "wrapped",
  });
  if (error) throw error;

  revalidatePath("/");
}
```

Note: `askModel` in this repo currently accepts `persona` as `PersonaKey`. Since we added `reflect_session` to `PersonaKey` in Task A2, this compiles.

- [ ] **Step 2: Typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual smoke-test**

Restart dev server if needed. Wrap a session; wrap again without changing anything. Check `reflections` table: exactly one row for `(project, session_wrap, scene_id)` with one insert and zero updates. Check `ai_interactions`: only one call.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/\(app\)/session-actions.ts
git commit -m "reflections: session wrap hits cache on unchanged inputs"
```

### Task C5: Rewire chapter debrief to use the cache

**Files:**
- Modify: `web/src/lib/ai/chapter-debrief.ts`

- [ ] **Step 1: Rewrite to use the cache**

```ts
import { createHash } from "node:crypto";
import {
  aiReadyForWritingProfile,
  askModel,
  resolveModelFromProject,
} from "@/lib/ai/model";
import {
  aiProviderForWritingProfile,
  parseWritingProfile,
} from "@/lib/deployment/writing-profile";
import { getOrCreateProject } from "@/lib/projects";
import { stripHtml } from "@/lib/html";
import { getOrGenerateReflection } from "@/lib/ai/reflections";
import { supabaseServer } from "@/lib/supabase/server";
import type { Scene } from "@/lib/supabase/types";

export async function runChapterDebrief(
  chapterId: string,
): Promise<{ ok: boolean; text?: string; error?: string }> {
  const project = await getOrCreateProject();
  if (!project) return { ok: false, error: "No project." };

  const wp = parseWritingProfile(project.writing_profile);
  if (!aiReadyForWritingProfile(wp)) {
    return {
      ok: false,
      error:
        aiProviderForWritingProfile(wp) === "xai"
          ? "xAI API key not configured."
          : "Anthropic API key not configured.",
    };
  }

  const supabase = await supabaseServer();
  const { data: chapter } = await supabase
    .from("chapters")
    .select("title, order_index")
    .eq("id", chapterId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!chapter) return { ok: false, error: "Chapter not found." };

  const { data: scenes } = await supabase
    .from("scenes")
    .select("*")
    .eq("chapter_id", chapterId)
    .order("order_index");

  const prose = ((scenes ?? []) as Scene[])
    .map((s) => stripHtml(s.content ?? ""))
    .join("\n\n---\n\n");

  if (prose.length < 60) {
    return { ok: true, text: "Add more prose to this chapter before running a debrief." };
  }

  const chTitle =
    chapter.title?.trim() ||
    `Chapter ${(chapter.order_index ?? 0) + 1}`;

  const signature = createHash("sha256").update(prose).digest("hex");

  try {
    const body = await getOrGenerateReflection({
      projectId: project.id,
      kind: "chapter_debrief",
      targetId: chapterId,
      newSignature: signature,
      generate: async () => {
        const model = resolveModelFromProject(project.writing_profile, "quick");
        const { text, inputTokens, outputTokens, costUsd } = await askModel({
          persona: "reflect_chapter",
          system:
            "You are a developmental editor. Write two short paragraphs: (1) what shifts for the reader in this chapter emotionally and plot-wise, (2) one craft strength and one optional improvement. Plain language. No bullets.",
          user: `Chapter: ${chTitle}\n\nScene prose:\n${prose.slice(0, 14000)}`,
          model,
          temperature: 0.35,
          maxTokens: 500,
          projectId: project.id,
          contextType: "chapter_debrief",
          contextId: chapterId,
          writingProfile: wp,
        });
        return {
          body: text.trim(),
          model,
          inputTokens,
          outputTokens,
          costUsd,
          aiInteractionId: null,
        };
      },
    });
    return { ok: true, text: body };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Debrief failed.",
    };
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Smoke-test**

Open a chapter, run debrief. Check text is returned. Immediately run debrief again — it should return instantly (no new `ai_interactions` row). Edit the prose (add a sentence, save), run again — should regenerate.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/ai/chapter-debrief.ts
git commit -m "reflections: chapter debrief hits cache on unchanged prose"
```

---

## Phase D — AI changelog (`ai_log`)

Captures every AI-triggered state change with timestamp, kind, one-line summary, and a JSON detail blob. Surfaces under `/activity`.

### Task D1: `ai_log` migration

**Files:**
- Create: `supabase/migrations/0012_ai_log.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 012 — append-only AI activity log.
--
-- Every AI-triggered state change writes one row here. Queried for the
-- /activity surface and can be exported as markdown.

create table if not exists ai_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  kind text not null,
  summary text not null,
  detail jsonb not null default '{}'::jsonb,
  ai_interaction_id uuid references ai_interactions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_log_project_idx
  on ai_log (project_id, created_at desc);

alter table ai_log enable row level security;

drop policy if exists ai_log_owner on ai_log;
create policy ai_log_owner on ai_log for all using (
  ai_log.project_id is null
  or exists (select 1 from projects p where p.id = ai_log.project_id and p.user_id = auth.uid())
) with check (
  ai_log.project_id is null
  or exists (select 1 from projects p where p.id = ai_log.project_id and p.user_id = auth.uid())
);
```

- [ ] **Step 2: Apply to staging**

```bash
supabase db push --project-ref "$BAB_STAGING_REF"
```

Expected: migration applied.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0012_ai_log.sql
git commit -m "db: ai_log table for append-only AI activity"
```

### Task D2: AI log service

**Files:**
- Create: `web/src/lib/ai/log.ts`
- Modify: `web/src/lib/supabase/types.ts`

- [ ] **Step 1: Add the type**

Append to `web/src/lib/supabase/types.ts`:

```ts
export type AiLogEntry = {
  id: string;
  project_id: string | null;
  kind: string;
  summary: string;
  detail: Record<string, unknown>;
  ai_interaction_id: string | null;
  created_at: string;
};
```

- [ ] **Step 2: Implement the helper**

```ts
// web/src/lib/ai/log.ts
import { supabaseServer } from "@/lib/supabase/server";

export type AiLogInput = {
  projectId: string | null;
  kind: string;
  summary: string;
  detail?: Record<string, unknown>;
  aiInteractionId?: string | null;
};

/** Best-effort append. Never throws — a failed log must not break the caller. */
export async function logAiActivity(entry: AiLogInput): Promise<void> {
  try {
    const supabase = await supabaseServer();
    await supabase.from("ai_log").insert({
      project_id: entry.projectId,
      kind: entry.kind,
      summary: entry.summary,
      detail: entry.detail ?? {},
      ai_interaction_id: entry.aiInteractionId ?? null,
    });
  } catch (e) {
    console.error("ai_log insert failed:", e);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/ai/log.ts web/src/lib/supabase/types.ts
git commit -m "ai-log: service helper with safe best-effort insert"
```

### Task D3: Emit log entries from compile pipeline

**Files:**
- Modify: `web/src/lib/wiki/compile.ts`

- [ ] **Step 1: Log once per compile run**

At the top of `web/src/lib/wiki/compile.ts`, import:

```ts
import { logAiActivity } from "@/lib/ai/log";
```

At the end of `compileProjectWiki`, before `return report;`, add:

```ts
  await logAiActivity({
    projectId,
    kind: "compile.project",
    summary: `Compiled wiki: ${report.characters.inserted} chars / ${report.world.inserted} world / ${report.relationships.inserted} rels / threads=${report.threads} / storyline=${report.storyline}`,
    detail: report as unknown as Record<string, unknown>,
  });
```

- [ ] **Step 2: Typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/wiki/compile.ts
git commit -m "ai-log: record every compile run"
```

### Task D4: Emit log entries from reflections

**Files:**
- Modify: `web/src/lib/ai/reflections.ts`

- [ ] **Step 1: Emit on both hit and miss**

In `getOrGenerateReflection`, after the insert/update branches, emit a log entry:

```ts
  await logAiActivity({
    projectId: args.projectId,
    kind: `reflect.${args.kind}`,
    summary: result.hit
      ? `Cache hit for ${args.kind}`
      : `Generated new ${args.kind}`,
    detail: {
      target_id: args.targetId,
      hit: result.hit,
      signature: args.newSignature.slice(0, 12),
    },
  });
```

Import at top:

```ts
import { logAiActivity } from "@/lib/ai/log";
```

- [ ] **Step 2: Typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/ai/reflections.ts
git commit -m "ai-log: record every reflection generate/cache-hit"
```

### Task D5: `/activity` page

**Files:**
- Create: `web/src/app/(app)/activity/page.tsx`

- [ ] **Step 1: Implement**

```tsx
// web/src/app/(app)/activity/page.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import type { AiLogEntry } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("ai_log")
    .select("*")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as AiLogEntry[];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Changelog
        </p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          AI activity
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every AI-triggered change: compiles, reflections, extractions. Append-only.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="rounded-md border bg-card p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {r.kind}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>
              <p className="mt-1">{r.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Smoke-test**

In the app, visit `/activity`. Confirm entries from prior compiles / reflections show up newest-first.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/\(app\)/activity
git commit -m "ai-log: /activity page lists recent AI-triggered changes"
```

### Task D6: Optional — export activity as markdown

**Files:**
- Create: `web/src/app/api/activity/export/route.ts`

- [ ] **Step 1: Implement a GET route that streams a markdown file**

```ts
// web/src/app/api/activity/export/route.ts
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import type { AiLogEntry } from "@/lib/supabase/types";

export async function GET() {
  const project = await getOrCreateProject();
  if (!project) return new Response("Unauthorized", { status: 401 });

  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("ai_log")
    .select("*")
    .eq("project_id", project.id)
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as AiLogEntry[];

  const lines: string[] = [`# AI activity log`, ""];
  for (const r of rows) {
    lines.push(
      `- \`${new Date(r.created_at).toISOString()}\` **${r.kind}** — ${r.summary}`,
    );
  }

  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="ai-log-${project.id}.md"`,
    },
  });
}
```

- [ ] **Step 2: Smoke-test**

Visit `/api/activity/export` — a `.md` file should download.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/activity
git commit -m "ai-log: markdown export route"
```

---

## Phase E — Optional first step toward `[[wiki-links]]`

Deferred mostly, per user: a full TipTap node + UI is out of scope. But the compilers already emit `[[Name]]` in bodies (character/relationship), and this phase adds backlink resolution so the wiki browser can show "cited by."

### Task E1: Parse `[[...]]` references out of compiled bodies

**Files:**
- Create: `web/src/lib/wiki/links.ts`
- Create: `web/src/lib/wiki/links.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/wiki/links.test.ts
import { describe, expect, it } from "vitest";
import { extractWikiLinks } from "./links";

describe("extractWikiLinks", () => {
  it("finds simple [[Name]] references", () => {
    expect(extractWikiLinks("- [[Mara]] and [[Kade]] meet")).toEqual([
      "Mara",
      "Kade",
    ]);
  });

  it("dedupes and preserves first-seen order", () => {
    expect(
      extractWikiLinks("[[Mara]] spoke to [[Kade]]. Later [[Mara]] left."),
    ).toEqual(["Mara", "Kade"]);
  });

  it("ignores code fences", () => {
    expect(
      extractWikiLinks("```\n[[Skip me]]\n```\n[[Keep me]]"),
    ).toEqual(["Keep me"]);
  });

  it("strips pipe aliases `[[Target|display]]`", () => {
    expect(extractWikiLinks("[[Mating Bonds|bonds]]")).toEqual(["Mating Bonds"]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd web && npm test -- --run links
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// web/src/lib/wiki/links.ts
const CODE_FENCE = /```[\s\S]*?```/g;
const LINK = /\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g;

export function extractWikiLinks(md: string): string[] {
  const cleaned = md.replace(CODE_FENCE, "");
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = LINK.exec(cleaned)) !== null) {
    const name = m[1].trim();
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd web && npm test -- --run links
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/wiki/links.ts web/src/lib/wiki/links.test.ts
git commit -m "wiki: [[name]] link extraction utility with tests"
```

### Task E2: Show backlinks on the wiki detail page

**Files:**
- Modify: `web/src/app/(app)/wiki/[docKey]/page.tsx`

- [ ] **Step 1: Compute and render backlinks**

After the existing data load, before the return statement, resolve which other current docs reference this doc's title:

```ts
  const { data: all } = await (await supabaseServer())
    .from("wiki_documents")
    .select("id, doc_type, doc_key, title, body_md")
    .eq("project_id", project.id)
    .eq("status", "current");

  const { extractWikiLinks } = await import("@/lib/wiki/links");
  const target = (doc.title || "").toLowerCase();
  const backlinks = (all ?? [])
    .filter((d) => d.id !== doc.id)
    .filter((d) => {
      const links = extractWikiLinks(d.body_md).map((n) => n.toLowerCase());
      return links.includes(target);
    });
```

Then below the `<pre>` block, add:

```tsx
      {backlinks.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Referenced by</h2>
          <ul className="space-y-1 text-sm">
            {backlinks.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/wiki/${encodeURIComponent(b.doc_key)}?type=${b.doc_type}`}
                  className="underline-offset-4 hover:underline"
                >
                  {b.title || b.doc_key}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">
                  {b.doc_type}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
```

- [ ] **Step 2: Smoke-test**

Compile wiki. Visit a character doc whose name appears in a relationship. Confirm the relationship doc is listed under "Referenced by."

- [ ] **Step 3: Commit**

```bash
git add web/src/app/\(app\)/wiki/\[docKey\]/page.tsx
git commit -m "wiki: backlinks on detail page from [[name]] extraction"
```

---

## Phase F — TipTap `[[...]]` authoring in scene prose

**Goal:** Complete item 3 of the user's approval list ("Markdown as SSOT + `[[wiki-links]]`"). When a writer types `[[` in the scene editor, they get an autocomplete of characters, world elements, relationships, threads, and compiled wiki docs. Selecting one inserts a first-class TipTap node that renders in prose, survives save/reload, and serializes cleanly to the `[[Name]]` markdown shape that Phase A compilers already understand.

### Architecture notes

- **One node, many target types.** A single `WikiLink` node with attributes `{ targetType, targetKey, display }`. `targetType` is the same union as `WikiDocType` (`character | world | relationship | thread | storyline | index`).
- **Storage format.** Scenes keep storing HTML in `scenes.content`. The node serializes as:
  ```html
  <span data-wiki-link="1" data-target-type="character" data-target-key="mara-voss">Mara</span>
  ```
  This keeps the existing `stripHtml()` helper working — stripped text still contains the display name, so `chapter-mentions.ts` regex counting keeps working as a fallback during rollout.
- **Autocomplete source.** A server action unions:
  1. `characters` (name, id) as `targetType=character`, `targetKey=slug(name)`
  2. `world_elements` (name, id) as `targetType=world`
  3. `wiki_documents` current rows (title, doc_key, doc_type) for `relationship`, `thread`, `storyline`, `index` docs that don't have a raw-table equivalent.
  Union is deduped by `(targetType, targetKey)`. Sorted by name.
- **No TipTap `@character` mention node exists today.** This is a net-new mention system — we're not extending anything.
- **Out of scope for Phase F:**
  - Auto-linking existing scene prose (backfill of `[[...]]` markers for character names that appear unlinked). Can be a separate one-shot script later.
  - Using `[[...]]` references found in scene prose to influence compiled wiki relevance. Phase A compilers already emit links in wiki bodies; reading them back from scene prose is nice-to-have.
  - Link-integrity linting (orphan `[[Name]]` pointing at nothing). The `extractWikiLinks` utility from Phase E makes this a one-pager; add a separate plan if/when needed.

### Task F1: Install dependencies

**Files:**
- Modify: `web/package.json`

- [ ] **Step 1: Install**

```bash
cd web && npm install @tiptap/extension-mention@^3 @tiptap/suggestion@^3 tippy.js@^6
```

- [ ] **Step 2: Verify lockfile changes are sensible**

`package.json` should add exactly three dependencies at the `@tiptap/*` version already in use (`^3.22.4`). No major version bumps to existing TipTap packages.

- [ ] **Step 3: Commit**

```bash
git add web/package.json web/package-lock.json
git commit -m "deps: add tiptap mention + suggestion + tippy for [[wiki-link]] node"
```

### Task F2: Autocomplete server action (TDD)

**Files:**
- Create: `web/src/lib/wiki/mention-search.ts`
- Create: `web/src/lib/wiki/mention-search.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// web/src/lib/wiki/mention-search.test.ts
import { describe, expect, it } from "vitest";
import { mergeMentionCandidates, type MentionCandidate } from "./mention-search";

describe("mergeMentionCandidates", () => {
  it("unions character, world, and wiki-doc-only rows", () => {
    const chars: MentionCandidate[] = [
      { targetType: "character", targetKey: "mara-voss", display: "Mara Voss" },
    ];
    const worlds: MentionCandidate[] = [
      { targetType: "world", targetKey: "mating-bonds", display: "Mating Bonds" },
    ];
    const docs: MentionCandidate[] = [
      { targetType: "thread", targetKey: "unresolved-ship", display: "Unresolved: ship's origin" },
    ];
    const merged = mergeMentionCandidates({ chars, worlds, docs });
    expect(merged.map((m) => m.targetType).sort()).toEqual([
      "character",
      "thread",
      "world",
    ]);
  });

  it("drops wiki-doc rows whose (type,key) already came from raw tables", () => {
    const chars: MentionCandidate[] = [
      { targetType: "character", targetKey: "mara-voss", display: "Mara Voss" },
    ];
    const docs: MentionCandidate[] = [
      { targetType: "character", targetKey: "mara-voss", display: "Mara (compiled)" },
    ];
    const merged = mergeMentionCandidates({ chars, worlds: [], docs });
    expect(merged).toHaveLength(1);
    expect(merged[0].display).toBe("Mara Voss");
  });

  it("sorts by display name, case-insensitive", () => {
    const merged = mergeMentionCandidates({
      chars: [
        { targetType: "character", targetKey: "zeb", display: "Zeb" },
        { targetType: "character", targetKey: "ana", display: "Ana" },
      ],
      worlds: [],
      docs: [],
    });
    expect(merged.map((m) => m.display)).toEqual(["Ana", "Zeb"]);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

```bash
cd web && npm test -- --run mention-search
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// web/src/lib/wiki/mention-search.ts
import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import type { WikiDocType } from "@/lib/supabase/types";
import { entitySlug } from "@/lib/wiki/signature";

export type MentionTargetType = WikiDocType;

export type MentionCandidate = {
  targetType: MentionTargetType;
  targetKey: string;     // slug for characters/world; doc_key for wiki-only docs
  display: string;
};

type MergeInput = {
  chars: MentionCandidate[];
  worlds: MentionCandidate[];
  docs: MentionCandidate[];
};

export function mergeMentionCandidates({
  chars,
  worlds,
  docs,
}: MergeInput): MentionCandidate[] {
  const key = (c: MentionCandidate) => `${c.targetType}:${c.targetKey}`;
  const seen = new Map<string, MentionCandidate>();
  for (const c of [...chars, ...worlds]) seen.set(key(c), c);
  for (const d of docs) if (!seen.has(key(d))) seen.set(key(d), d);
  return [...seen.values()].sort((a, b) =>
    a.display.localeCompare(b.display, undefined, { sensitivity: "base" }),
  );
}

/** Called from the client suggestion plugin via a server action. */
export async function searchMentionCandidates(
  projectId: string,
  query: string,
  limit = 8,
): Promise<MentionCandidate[]> {
  const supabase = await supabaseServer();
  const q = query.trim();
  const ilike = q ? `%${q}%` : "%";

  const [{ data: chars }, { data: worlds }, { data: docs }] = await Promise.all([
    supabase
      .from("characters")
      .select("name")
      .eq("project_id", projectId)
      .ilike("name", ilike)
      .limit(limit),
    supabase
      .from("world_elements")
      .select("name")
      .eq("project_id", projectId)
      .ilike("name", ilike)
      .limit(limit),
    supabase
      .from("wiki_documents")
      .select("doc_type, doc_key, title")
      .eq("project_id", projectId)
      .eq("status", "current")
      .in("doc_type", ["relationship", "thread", "storyline", "index"])
      .ilike("title", ilike)
      .limit(limit),
  ]);

  const merged = mergeMentionCandidates({
    chars: (chars ?? []).map((c) => ({
      targetType: "character" as const,
      targetKey: entitySlug(c.name),
      display: c.name,
    })),
    worlds: (worlds ?? []).map((w) => ({
      targetType: "world" as const,
      targetKey: entitySlug(w.name),
      display: w.name,
    })),
    docs: (docs ?? []).map((d) => ({
      targetType: d.doc_type as MentionTargetType,
      targetKey: d.doc_key,
      display: d.title || d.doc_key,
    })),
  });

  return merged.slice(0, limit);
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd web && npm test -- --run mention-search
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/wiki/mention-search.ts web/src/lib/wiki/mention-search.test.ts
git commit -m "wiki: unioned mention candidate search (characters + world + wiki docs)"
```

### Task F3: Server action wrapper for the client

**Files:**
- Create: `web/src/app/(app)/scenes/mention-actions.ts`

Tiptap's suggestion plugin runs in the browser; we need a server action it can call.

- [ ] **Step 1: Implement**

```ts
// web/src/app/(app)/scenes/mention-actions.ts
"use server";

import { getOrCreateProject } from "@/lib/projects";
import {
  searchMentionCandidates,
  type MentionCandidate,
} from "@/lib/wiki/mention-search";

export async function mentionSearchAction(
  query: string,
): Promise<MentionCandidate[]> {
  const project = await getOrCreateProject();
  return searchMentionCandidates(project.id, query, 8);
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/app/\(app\)/scenes/mention-actions.ts
git commit -m "wiki: server action wrapper for mention candidate search"
```

### Task F4: WikiLink TipTap node (TDD)

**Files:**
- Create: `web/src/lib/tiptap/wiki-link-node.ts`
- Create: `web/src/lib/tiptap/wiki-link-node.test.ts`

The node is configured off `@tiptap/extension-mention` so we inherit the suggestion machinery. We override `renderHTML` / `parseHTML` to use our `data-wiki-link` attribute schema.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/tiptap/wiki-link-node.test.ts
import { describe, expect, it } from "vitest";
import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import { WikiLink } from "./wiki-link-node";

describe("WikiLink node", () => {
  it("serializes to span[data-wiki-link] with type/key/display attrs", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Then " },
            {
              type: "wikiLink",
              attrs: {
                targetType: "character",
                targetKey: "mara-voss",
                display: "Mara",
              },
            },
            { type: "text", text: " arrived." },
          ],
        },
      ],
    };
    const html = generateHTML(doc, [StarterKit, WikiLink]);
    expect(html).toContain(
      '<span data-wiki-link="1" data-target-type="character" data-target-key="mara-voss">Mara</span>',
    );
  });

  it("parses back the same shape from HTML", () => {
    // Round-trip via generateJSON — mirrors what TipTap will do on load.
    const { generateJSON } = require("@tiptap/html");
    const html =
      '<p><span data-wiki-link="1" data-target-type="world" data-target-key="mating-bonds">bonds</span></p>';
    const json = generateJSON(html, [StarterKit, WikiLink]);
    const node = json.content[0].content[0];
    expect(node.type).toBe("wikiLink");
    expect(node.attrs.targetType).toBe("world");
    expect(node.attrs.targetKey).toBe("mating-bonds");
    expect(node.attrs.display).toBe("bonds");
  });
});
```

- [ ] **Step 2: Run, verify it fails**

```bash
cd web && npm test -- --run wiki-link-node
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// web/src/lib/tiptap/wiki-link-node.ts
import Mention from "@tiptap/extension-mention";
import { mergeAttributes } from "@tiptap/core";

export const WikiLink = Mention.extend({
  name: "wikiLink",
  priority: 200,
  addAttributes() {
    return {
      targetType: {
        default: "character",
        parseHTML: (el) => el.getAttribute("data-target-type") ?? "character",
        renderHTML: (attrs) => ({ "data-target-type": attrs.targetType }),
      },
      targetKey: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-target-key") ?? "",
        renderHTML: (attrs) => ({ "data-target-key": attrs.targetKey }),
      },
      display: {
        default: "",
        parseHTML: (el) => el.textContent ?? "",
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-wiki-link]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-wiki-link": "1" }),
      node.attrs.display || node.attrs.targetKey,
    ];
  },
  renderText({ node }) {
    return `[[${node.attrs.display || node.attrs.targetKey}]]`;
  },
});
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd web && npm test -- --run wiki-link-node
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/tiptap/wiki-link-node.ts web/src/lib/tiptap/wiki-link-node.test.ts
git commit -m "tiptap: WikiLink node with data-wiki-link span serialization"
```

### Task F5: Suggestion plugin + popup UI

**Files:**
- Create: `web/src/lib/tiptap/wiki-link-suggestion.tsx`
- Create: `web/src/components/wiki-link-popup.tsx`

The popup is a small client component rendered via `tippy.js` anchored to the trigger. Arrow keys move the selection; Enter inserts.

- [ ] **Step 1: Implement the popup**

```tsx
// web/src/components/wiki-link-popup.tsx
"use client";

import { forwardRef, useImperativeHandle, useState, useEffect } from "react";
import type { MentionCandidate } from "@/lib/wiki/mention-search";

type Props = {
  items: MentionCandidate[];
  command: (item: MentionCandidate) => void;
};

export type WikiLinkPopupHandle = {
  onKeyDown: (event: KeyboardEvent) => boolean;
};

export const WikiLinkPopup = forwardRef<WikiLinkPopupHandle, Props>(
  function WikiLinkPopup({ items, command }, ref) {
    const [index, setIndex] = useState(0);
    useEffect(() => setIndex(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: (event) => {
        if (event.key === "ArrowUp") {
          setIndex((i) => (i + items.length - 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === "ArrowDown") {
          setIndex((i) => (i + 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === "Enter") {
          const item = items[index];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="min-w-[240px] rounded-md border bg-popover p-2 text-xs text-muted-foreground shadow-md">
          No matching characters, world elements, or wiki docs.
        </div>
      );
    }

    return (
      <div className="min-w-[240px] overflow-hidden rounded-md border bg-popover p-1 text-sm shadow-md">
        {items.map((item, i) => (
          <button
            key={`${item.targetType}:${item.targetKey}`}
            type="button"
            onClick={() => command(item)}
            className={`flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left ${
              i === index ? "bg-accent text-accent-foreground" : ""
            }`}
          >
            <span>{item.display}</span>
            <span className="text-xs text-muted-foreground">{item.targetType}</span>
          </button>
        ))}
      </div>
    );
  },
);
```

- [ ] **Step 2: Implement the suggestion config**

```tsx
// web/src/lib/tiptap/wiki-link-suggestion.tsx
"use client";

import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import tippy, { type Instance } from "tippy.js";
import { WikiLinkPopup, type WikiLinkPopupHandle } from "@/components/wiki-link-popup";
import { mentionSearchAction } from "@/app/(app)/scenes/mention-actions";
import type { MentionCandidate } from "@/lib/wiki/mention-search";

export const wikiLinkSuggestion: Omit<SuggestionOptions<MentionCandidate>, "editor"> = {
  char: "[[",
  allowSpaces: true,
  items: async ({ query }) => mentionSearchAction(query),
  command: ({ editor, range, props }) => {
    editor
      .chain()
      .focus()
      .insertContentAt(range, [
        {
          type: "wikiLink",
          attrs: {
            targetType: props.targetType,
            targetKey: props.targetKey,
            display: props.display,
          },
        },
        { type: "text", text: " " },
      ])
      .run();
  },
  render: () => {
    let component: ReactRenderer<WikiLinkPopupHandle, { items: MentionCandidate[]; command: (item: MentionCandidate) => void }> | null = null;
    let popup: Instance[] | null = null;
    return {
      onStart: (props) => {
        component = new ReactRenderer(WikiLinkPopup, {
          props: { items: props.items, command: props.command },
          editor: props.editor,
        });
        if (!props.clientRect) return;
        popup = tippy("body", {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
        });
      },
      onUpdate: (props) => {
        component?.updateProps({ items: props.items, command: props.command });
        if (!props.clientRect) return;
        popup?.[0]?.setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
      },
      onKeyDown: (props) => component?.ref?.onKeyDown(props.event) ?? false,
      onExit: () => {
        popup?.[0]?.destroy();
        component?.destroy();
      },
    };
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/tiptap/wiki-link-suggestion.tsx web/src/components/wiki-link-popup.tsx
git commit -m "tiptap: WikiLink [[ suggestion popup with arrow/enter keybinds"
```

### Task F6: Wire into ProseEditor

**Files:**
- Modify: `web/src/components/prose-editor.tsx`

- [ ] **Step 1: Add the extension behind a prop flag**

Add a new optional prop so non-scene callers (if any) aren't forced to load the suggestion plugin:

```ts
  enableWikiLinks?: boolean;
```

Import and add to extensions conditionally:

```ts
import { WikiLink } from "@/lib/tiptap/wiki-link-node";
import { wikiLinkSuggestion } from "@/lib/tiptap/wiki-link-suggestion";
// ...
extensions: [
  StarterKit.configure({ heading: { levels: [2, 3] }, horizontalRule: {} }),
  Placeholder.configure({ placeholder: placeholder || "Start writing…" }),
  ...(enableWikiLinks
    ? [WikiLink.configure({ suggestion: wikiLinkSuggestion })]
    : []),
],
```

- [ ] **Step 2: Turn on in scene focus client**

In `web/src/app/(app)/scenes/[id]/scene-focus-client.tsx`, pass `enableWikiLinks` to `<ProseEditor />`. No other caller needs it.

- [ ] **Step 3: Manual smoke test**

1. `npm run dev`, open any scene.
2. Type `[[ma` — expect a popup listing every character/world/thread whose name contains "ma".
3. Arrow-down + Enter — a link chip appears inline.
4. Save (auto-saves on blur); reload — the chip persists.
5. Inspect `scenes.content` in the DB — HTML contains `<span data-wiki-link="1" data-target-type="character" data-target-key="…">…</span>`.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/prose-editor.tsx web/src/app/\(app\)/scenes/\[id\]/scene-focus-client.tsx
git commit -m "editor: enable [[wiki-link]] authoring in scene prose"
```

### Task F7: Reading-layer styling + broken-link affordance

**Files:**
- Modify: `web/src/app/globals.css` (or wherever TipTap styles live — search `tiptap`)

- [ ] **Step 1: Find the existing TipTap stylesheet**

```bash
cd web && grep -rnw "tiptap" src/app/globals.css src/**/*.css 2>/dev/null | head
```

- [ ] **Step 2: Add styling for wiki-link spans**

```css
.tiptap span[data-wiki-link] {
  background: color-mix(in oklab, var(--color-primary) 12%, transparent);
  border-bottom: 1px dotted color-mix(in oklab, var(--color-primary) 60%, transparent);
  padding: 0 0.15em;
  border-radius: 0.125rem;
  cursor: help;
}
.tiptap span[data-wiki-link][data-target-key=""] {
  background: color-mix(in oklab, var(--color-destructive) 12%, transparent);
  border-bottom-color: var(--color-destructive);
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/app/globals.css
git commit -m "editor: style [[wiki-link]] spans + highlight broken links"
```

### Task F8: Node-aware mention counter (TDD)

**Files:**
- Create: `web/src/lib/mentions/wiki-link-mentions.ts`
- Create: `web/src/lib/mentions/wiki-link-mentions.test.ts`
- Modify: `web/src/lib/ai/post-save-scene.ts`

The existing `chapter-mentions.ts` counts name regex on stripped HTML. Once scenes use `[[wiki-link]]` nodes, the node-aware counter becomes the preferred path: exact attribution, no false positives from overlapping names.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/mentions/wiki-link-mentions.test.ts
import { describe, expect, it } from "vitest";
import { extractWikiLinkNodes } from "./wiki-link-mentions";

describe("extractWikiLinkNodes", () => {
  it("pulls targetType/targetKey/display from span[data-wiki-link]", () => {
    const html = `<p>Then <span data-wiki-link="1" data-target-type="character" data-target-key="mara-voss">Mara</span> spoke to <span data-wiki-link="1" data-target-type="character" data-target-key="kade">Kade</span>.</p>`;
    expect(extractWikiLinkNodes(html)).toEqual([
      { targetType: "character", targetKey: "mara-voss", display: "Mara" },
      { targetType: "character", targetKey: "kade", display: "Kade" },
    ]);
  });

  it("returns [] for plain HTML", () => {
    expect(extractWikiLinkNodes("<p>Nothing here</p>")).toEqual([]);
  });

  it("skips spans missing target-key", () => {
    const html = `<p><span data-wiki-link="1" data-target-type="character" data-target-key="">x</span></p>`;
    expect(extractWikiLinkNodes(html)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify fail; implement**

```ts
// web/src/lib/mentions/wiki-link-mentions.ts
import type { MentionCandidate } from "@/lib/wiki/mention-search";

const TAG = /<span\b[^>]*\bdata-wiki-link\b[^>]*>([\s\S]*?)<\/span>/g;
const ATTR = (name: string) =>
  new RegExp(`\\bdata-${name}\\s*=\\s*"([^"]*)"`, "i");

export function extractWikiLinkNodes(html: string): MentionCandidate[] {
  const out: MentionCandidate[] = [];
  let m: RegExpExecArray | null;
  while ((m = TAG.exec(html)) !== null) {
    const span = m[0];
    const targetType = span.match(ATTR("target-type"))?.[1] ?? "";
    const targetKey = span.match(ATTR("target-key"))?.[1] ?? "";
    const display = m[1].replace(/<[^>]*>/g, "").trim();
    if (!targetKey) continue;
    out.push({
      targetType: targetType as MentionCandidate["targetType"],
      targetKey,
      display,
    });
  }
  return out;
}
```

- [ ] **Step 3: Run tests, verify pass**

```bash
cd web && npm test -- --run wiki-link-mentions
```

- [ ] **Step 4: Wire into `post-save-scene`**

This is an additive observation — it does not replace `recountChapterCharacterMentions`/`recountChapterElementMentions`. Both run. The node-aware counter gives us an exact-attribution channel for Phase A compiler inputs later.

Inside `firePostSaveScenePipeline`, after the existing recount calls, query scene content and emit link counts grouped by `(targetType, targetKey, chapter_id)`. Store them where? We don't need a new table for Phase F — log them as an observation in `ai_log` (Phase D) so we can see "scene X now links to 3 characters explicitly":

```ts
import { extractWikiLinkNodes } from "@/lib/mentions/wiki-link-mentions";
import { logAiActivity } from "@/lib/ai/log";
// ...
// inside firePostSaveScenePipeline, after existing mention recount calls:
const { data: sceneRow } = await supabase
  .from("scenes")
  .select("content, chapter_id, chapters ( project_id )")
  .eq("id", sceneId)
  .maybeSingle();
const html = sceneRow?.content ?? "";
const nodes = extractWikiLinkNodes(html);
if (nodes.length > 0 && sceneRow?.chapters?.project_id) {
  await logAiActivity({
    projectId: sceneRow.chapters.project_id,
    kind: "scene_wiki_links",
    summary: `Scene ${sceneId} has ${nodes.length} wiki links`,
    detail: { sceneId, chapterId: sceneRow.chapter_id, nodes },
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/mentions/wiki-link-mentions.ts web/src/lib/mentions/wiki-link-mentions.test.ts web/src/lib/ai/post-save-scene.ts
git commit -m "mentions: node-aware [[wiki-link]] counter + log to ai_log"
```

### Task F9: End-to-end smoke + plan closure

- [ ] **Step 1: Full smoke**

1. Fresh scene, type `[[`.
2. Verify popup appears with characters + world + threads from the current project.
3. Insert one character, one world element, one thread.
4. Save; reload; verify all three chips persist and render styled.
5. Visit `/activity` — a `scene_wiki_links` row should appear with the three link attributions.
6. Compile wiki (`/wiki` recompile button). The relationship doc for the linked character (if any) should still show backlinks on its detail page via Phase E's `extractWikiLinks` utility (which, recall, reads compiled-wiki bodies, not scene prose — scene-prose backlinks are a future enhancement).

- [ ] **Step 2: Run the full test suite**

```bash
cd web && npm test
```

Expected: all tests pass (new: 3 + 2 + 3 = 8 tests added in F2 / F4 / F8).

- [ ] **Step 3: Final commit**

```bash
git commit --allow-empty -m "phase F: [[wiki-link]] authoring end-to-end"
```

---

## Self-review checklist

Run this before claiming done:

**Spec coverage:**
- [x] Item 1 — wiki model (A1–A9)
- [x] Item 2 — drop RAG (B3, B4)
- [x] Item 3 — markdown + `[[wiki-links]]` (A5–A8 emit in compiled bodies, E1–E2 extract for backlinks, F1–F9 author in scene prose)
- [x] Item 4 — character dossier as compiled artifact (A5, A9)
- [x] Item 5 — reflections cache (C1–C5)
- [x] Item 8 — append-only AI changelog (D1–D6)
- Skipped per user: audio ledger (6), chapter Q&A (7).

**Placeholder scan:** Every task has real code. No "TBD" / "implement later" / "handle edge cases" etc.

**Type consistency:**
- `WikiDocType` union matches the migration CHECK constraint.
- `PersonaKey` in Task A2 is extended to cover every `persona:` string used in downstream tasks (`reflect_session` in C4, `reflect_chapter` in C5).
- `CompiledDoc` shape matches what `upsertDoc` accepts.

**Verification expected after full execution:**
- `/wiki` lists one doc per character, world element, relationship, plus `threads` and `storyline` indexes.
- First call to Partner draft after edit-then-save hits compiled wiki (verify in `ai_interactions.prompt`).
- Session wrap twice-in-a-row on unchanged scene: one row in `reflections`, one (not two) rows in `ai_interactions`.
- `/activity` shows rows for every compile and reflection, plus `scene_wiki_links` rows after authoring `[[...]]` in a scene.
- `supabase/migrations/0010_wiki_documents.sql`, `0011_reflections.sql`, `0012_ai_log.sql` all applied.
- Typing `[[` in a scene opens an autocomplete popup; selection inserts a `span[data-wiki-link]` chip that survives save/reload.

---

## Out of scope for this plan

These are deliberately deferred:
- **Markdown-as-SSOT for scene prose** (item 4 of the original approvals, partially covered). Scenes still store HTML (with `[[wiki-link]]` nodes) in Postgres. Moving scene bodies to markdown files in Git is a non-reversible architectural shift and deserves its own plan + migration spike rather than being tacked onto this one.
- **Auto-link backfill of existing scene prose.** A one-shot script that walks every scene, finds bare character/world names, and wraps them in `[[wiki-link]]` nodes. Not needed to ship Phase F — writers can add links going forward.
- **Scene-prose `[[...]]` feeding compiled wiki relevance.** The F8 node counter logs to `ai_log` only. A future enhancement: use per-character link counts to rank "where does Mara show up" in character-doc compilation, and to show scene-prose backlinks on wiki detail pages.
- **Link-integrity lint.** An orphan-checker that flags `[[Name]]` pointing at nothing. Trivial to build on top of Phase E's `extractWikiLinks` + Phase F's `searchMentionCandidates`.
- **LLM-enriched character voice snapshots.** Compilers are deterministic. A future "enrich" pass can call Claude to add a voice paragraph to character docs.
- **Dropping `scene_chunks` table.** Retained with a deprecation header; a future cleanup migration can drop it.
- **Markdown export of full wiki.** Currently the wiki exists only in the DB. A "Download wiki as .zip of .md files" export is a small follow-up.
- **Audio ledger, chapter-Q&A schema** — explicitly declined by the user.

---

**Plan complete and saved to `web/planning/2026-04-21-wiki-compile-model.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.

**2. Inline Execution** — execute tasks in this session with checkpoints between phases.

**Which approach?**
