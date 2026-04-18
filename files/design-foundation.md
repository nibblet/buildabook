# Novella Writing App — Design Foundation (v0.2)

**Status:** Adopted. Applies from Phase 3 of the build plan onward, retrofit to Phase 0–2 surfaces in Phase D0–D4.
**Companion doc:** `novella-app-architecture-v2.md`
**One-line test:** *"Would someone choose to write here instead of a blank Google Doc?"* If no, it isn't done.

---

## 1. Philosophy

### 1.1 Core tension
- Writing = **focus**
- Story building = **structure**

The app separates these modes clearly. They share a typographic and color system but commit to different surfaces, densities, and motion.

### 1.2 Design intent
> *A calm, intimate writing space layered on top of a structured story system.*

Not a productivity dashboard. Not a Notion clone. Not a feature dump.

### 1.3 Success criteria
- She feels **invited to write**, not managed.
- UI fades during writing.
- Structure is **powerful but not intrusive**.
- Craft concepts are **taught inline**, never gatekept behind jargon.

---

## 2. Two modes, one system

Every route belongs to exactly one mode. Implemented as a `data-mode` attribute on the `(app)` route-group root; tokens cascade from that attribute.

| Mode | Routes | Surface | Intent |
|---|---|---|---|
| **Planning** | `/`, `/spine`, `/characters`, `/world`, `/relationships`, `/chapters`, `/beats/*`, `/project/settings`, `/admin` | Cool dusk — soft blue, dusty lavender accent, deep navy ink | Organize, scan, decide |
| **Writing** | `/scenes/[id]`, any future single-scene focus surface, `/freeform` | Warm paper — off-white, muted gold accent, deep navy ink | Disappear |

Rules:
- **Planning mode** may show multiple elements at once, accepts higher density, supports hover elevation.
- **Writing mode** hides non-essential UI, prefers hairline rules over shadows, centers content in a single column.
- **No mode mixing in a single view.** Chapter-reading views are planning. Scene-focus is writing. Don't split the difference.

---

## 3. Color system

### 3.1 Tokens

```css
/* writing surface — warm paper */
--paper:            #F8F7F4;   /* base background */
--paper-panel:      #FFFFFF;   /* rare; only for lifted cards in writing mode */
--paper-ink:        #1F2A44;   /* body text */
--paper-muted:      #5C6270;   /* secondary text */
--paper-rule:       #E9E5DD;   /* hairline */
--paper-accent:     #D4AF7F;   /* muted gold — primary action color */
--paper-accent-ink: #1F2A44;   /* text on gold */

/* planning chrome — cool dusk */
--dusk:             #EAF1FA;   /* base background */
--dusk-panel:       #F4F6FB;   /* card bg */
--dusk-lavender:    #E8E1F5;   /* secondary accent surfaces (hover, active row) */
--dusk-ink:         #1F2A44;
--dusk-muted:       #5C6270;
--dusk-rule:        #D8DEE9;
--dusk-accent:      #D4AF7F;   /* muted gold — primary action color (shared) */
--dusk-accent-ink:  #1F2A44;

/* state (shared across modes) */
--state-success:    #3F7D58;   /* covered beats, save confirmations */
--state-warning:    #B8882E;   /* fact-check flags, partial coverage */
--state-danger:     #B23B3B;   /* destructive only */
```

### 3.2 Semantic mapping

shadcn components read the standard semantic variables. Those are reassigned per mode:

```css
[data-mode="planning"] {
  --background: var(--dusk);
  --foreground: var(--dusk-ink);
  --card: var(--dusk-panel);
  --card-foreground: var(--dusk-ink);
  --popover: var(--dusk-panel);
  --popover-foreground: var(--dusk-ink);
  --primary: var(--dusk-accent);
  --primary-foreground: var(--dusk-accent-ink);
  --secondary: var(--dusk-lavender);
  --secondary-foreground: var(--dusk-ink);
  --muted: var(--dusk-panel);
  --muted-foreground: var(--dusk-muted);
  --accent: var(--dusk-lavender);
  --accent-foreground: var(--dusk-ink);
  --border: var(--dusk-rule);
  --input: var(--dusk-rule);
  --ring: var(--dusk-accent);
  --destructive: var(--state-danger);
  --destructive-foreground: #ffffff;
}

[data-mode="writing"] {
  --background: var(--paper);
  --foreground: var(--paper-ink);
  --card: var(--paper-panel);
  --card-foreground: var(--paper-ink);
  --popover: var(--paper-panel);
  --popover-foreground: var(--paper-ink);
  --primary: var(--paper-accent);
  --primary-foreground: var(--paper-accent-ink);
  --secondary: var(--paper-panel);
  --secondary-foreground: var(--paper-ink);
  --muted: var(--paper-panel);
  --muted-foreground: var(--paper-muted);
  --accent: var(--paper-panel);
  --accent-foreground: var(--paper-ink);
  --border: var(--paper-rule);
  --input: var(--paper-rule);
  --ring: var(--paper-accent);
  --destructive: var(--state-danger);
  --destructive-foreground: #ffffff;
}
```

### 3.3 Palette rules
- **No `#000`. No `#fff` as a primary surface.** `--paper-panel` uses pure white only for the occasional lifted card in writing mode.
- Gold is the primary action color in both modes. Use sparingly — one gold element per viewport is usually right. Never use gold for body text.
- Deep navy is the only approved text color for long reading. Muted grey for secondary labels and timestamps.
- Lavender is only for planning-mode hover/active states and the relationship/chemistry visualizations.

### 3.4 Contrast requirements
- Body text on primary surfaces: **AA minimum** (4.5:1).
- Gold buttons carry navy text (`#1F2A44` on `#D4AF7F` ≈ 6.3:1 — passes AA).
- Large display headers may drop to AA-large (3:1) but not lower.
- Every new component lands with contrast verified. No "it looks fine" shipping.

---

## 4. Dark mode

### 4.1 Policy
- **Auto-shift by default** via `prefers-color-scheme: dark`.
- Explicit override in `/project/settings` → `auto · light · dark`.
- Persisted per-user in `localStorage` as `ui:theme`; server-render respects the `Sec-CH-Prefers-Color-Scheme` hint when available.
- Dark mode ships in **App Phase 3** per the architecture roadmap (Design Phase D5).

### 4.2 Dark tokens (draft — tune during D5)

```css
/* writing surface, dark */
--paper-dark:            #1A1A1F;   /* deep graphite, not black */
--paper-dark-panel:      #232329;
--paper-dark-ink:        #E8E5DE;   /* warm off-white */
--paper-dark-muted:      #9A97A0;
--paper-dark-rule:       #2F2F36;
--paper-dark-accent:     #C79864;   /* warmer gold; pure gold is too bright at night */

/* planning chrome, dark */
--dusk-dark:             #121722;
--dusk-dark-panel:       #1A2030;
--dusk-dark-lavender:    #2A2440;
--dusk-dark-ink:         #E5EAF3;
--dusk-dark-muted:       #8F96A5;
--dusk-dark-rule:        #263047;
--dusk-dark-accent:      #C79864;
```

Same semantic mapping applies, reassigned under `[data-mode="planning"].dark` / `[data-mode="writing"].dark` scopes.

### 4.3 Dark mode intent
Dark mode is not grayscale-of-light. It's a different time of day. The writing surface in dark mode should feel like reading a hardcover by lamplight — graphite paper, warm ink, gold accents muted further.

---

## 5. Typography

### 5.1 Faces
- **Book prose** — `Lora` (already wired as `--font-lora`). Keep.
- **UI** — `Geist Sans` (already wired). Keep.
- **Mono** — `Geist Mono`. Admin only.

### 5.2 Scale

| Token | Size / line-height | Use |
|---|---|---|
| `prose-writing` | `1.125rem` / `1.75`, Lora | Scene prose, Partner output |
| `display` | `1.875rem` / `1.15`, Lora, `tracking-tight` | Page titles (dashboard h1, chapter title) |
| `headline` | `1.25rem` / `1.3`, Lora | Section leads, beat names on dashboard |
| `body` | `0.875rem` / `1.55`, Geist | Default UI |
| `body-lg` | `1rem` / `1.6`, Geist | Read-heavy UI (AI Profiler replies) |
| `caption` | `0.75rem` / `1.45`, Geist | Metadata, timestamps |
| `eyebrow` | `0.6875rem` / `1`, Geist, `uppercase tracking-wider font-medium` | Section labels ("Story so far", "Progress") |

Formalize `eyebrow` as a utility class `.label-eyebrow` in `globals.css` so we stop re-typing `text-[11px] font-medium uppercase tracking-wider text-muted-foreground` at every call site.

### 5.3 Line length
- Writing column: **~65 cpl** target. `max-w-2xl` + `1.125rem` Lora hits this.
- Mobile (< 480px viewport): drop to `1rem` / ~40 cpl. Readability beats the ideal measure.
- AI Partner response surface: ~55 cpl, slightly shorter since it's a thinking surface, not a reading surface.

### 5.4 Craft term styling
`<CraftTerm>` is first-class pedagogy, not decoration.

- Dotted underline, `1px`, `currentColor at 0.5 opacity`, `4px offset`.
- Weight: `font-medium`.
- Cursor: `help`.
- Tooltip surface uses `--popover` + `--popover-foreground`, `body-lg` type, 280px max width.

---

## 6. Spacing & layout

### 6.1 Rhythm
- Base unit is Tailwind `4px`.
- **Planning** grid gutter: `gap-4` minimum, `gap-6` preferred.
- **Writing** column padding: `px-6 py-8` minimum.
- No two adjacent top-level components without `mt-4+` between them.

### 6.2 Surfaces
- **Planning cards** — `rounded-lg border bg-card shadow-sm`. On hover: `shadow-md -translate-y-0.5 transition` (standard ease, `base` duration).
- **Writing cards** — `rounded-md border bg-paper-panel`. **No shadows.** Hairline only.
- **Modals / dialogs** — `rounded-xl shadow-lg`. Kept rare (see §9).

### 6.3 Density preferences
- Writing mode: one content column, zero siblings unless explicitly toggled.
- Planning mode: 2–3 column grids at desktop (`md:grid-cols-2 lg:grid-cols-3`). Collapse to single column at `< 768px`.

---

## 7. Motion

### 7.1 Tokens

```ts
// src/lib/motion.ts
export const ease = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  enter:    "cubic-bezier(0, 0, 0, 1)",
  exit:     "cubic-bezier(0.4, 0, 1, 1)",
} as const;

export const dur = { fast: 120, base: 180, slow: 280, focus: 420 } as const;
```

### 7.2 Rules (preferences, not police)
- Nothing shorter than `fast` (120ms). Anything under feels twitchy.
- Nothing longer than `focus` (420ms) except deliberate attention moments (Focus Mode toggle, first onboarding reveal).
- Always pair a duration with an ease. No `transition: all` — specify properties.
- Reduced motion: honor `prefers-reduced-motion: reduce` — drop durations to `0ms` and disable translate/scale transforms. Opacity changes still OK.

### 7.3 Canonical motions
- **Card hover** → `shadow`, `translate-y` · `base` · `standard`
- **Pill activate** → `background-color`, `color` · `fast` · `standard`
- **Panel enter** → `opacity`, `translate-y(4px → 0)` · `slow` · `enter`
- **Focus Mode toggle** → `opacity`, `max-width` on column · `focus` · `standard`
- **AI response appear** → `opacity` + subtle `blur(2px → 0)` on the text block · `slow` · `enter`

---

## 8. Components

### 8.1 Scene focus editor (`src/app/(app)/scenes/[id]/scene-focus-client.tsx`)
- `data-mode="writing"`.
- Header bar collapses to muted gold save indicator + wordcount only; everything else behind a menu.
- Beats + goal/conflict/outcome `<details>` start collapsed after the first save.
- Remove `bg-muted/30` from collapsibles — hairline-only surface in writing mode.
- Partner output inserts inherit `prose-writing` type automatically.

### 8.2 Team panel (`src/components/team-panel.tsx`)
- In writing mode: warm translucent surface (`bg-paper/80 backdrop-blur`), hairline left rule.
- Persona pills use `<Chip>` (§8.5). Active = tinted surface, not full gold.
- Partner response surface always uses `prose-writing` scale at `text-[15px]`. Profiler/Specialist use `body-lg`.
- In Focus Mode the panel is hidden; a small floating pill at bottom-right reopens it.

### 8.3 Novel spine (`src/components/novel-spine.tsx`)
- Vertical rhythm increased: scenes at `space-y-1.5`, beats at `space-y-2`.
- Coverage marker: soft dot replacing hard icon for `empty`; filled gold dot for `covered`; half-filled for `partial`. (State-success/warning reserved for explicit status, not coverage.)
- Drop `ChevronRight` on chapter rows — the indent is enough.
- Active row uses `--accent` (lavender in planning mode), never gold.

### 8.4 Dashboard (`src/app/(app)/page.tsx`)
- "Where you are" lead with **beat name as `headline`** (Lora), not a muted label.
- Progress ring replaces the linear bar. Beneath the ring: **narrative frame line** derived from word count + beat position. Example: *"About a third of the way through Act 1. Two beats covered, one started."*
- "What's next" list items: on hover, row lifts `shadow-sm → shadow-md`, gold arrow reveals.

### 8.5 Chip (new — `src/components/ui/chip.tsx`)
Shared component for every pill-style selector (beats, personas, tropes, filters).

- Inactive: `border border-input bg-background text-muted-foreground`.
- Active: `border-transparent bg-accent text-accent-foreground`. Gold fill is reserved for the single "primary" chip per group (rare).
- Hover: `bg-accent/60`.
- Size: `h-7 px-3 text-xs` default; `h-9 px-4 text-sm` large.
- Motion: background + color only, `fast` + `standard`.

### 8.6 Buttons (`src/components/ui/button.tsx`)
- `default` = gold primary in planning, gold primary in writing (same token, different feel via surface).
- `secondary` = lavender in planning, paper-panel in writing.
- `ghost` = no bg, hover `bg-accent`.
- Writing-mode pages prefer `ghost` / `outline`. A gold button on paper is a moment; don't spend it on "Save" (autosave handles that).

### 8.7 Cards
No change to `src/components/ui/card.tsx`. Token changes flow through automatically.

### 8.8 Dialogs & popovers
- Dialogs: `rounded-xl shadow-lg` on `--popover`. Keep `@radix-ui/react-dialog`.
- Popovers (tooltips, craft terms): `rounded-md shadow-md` on `--popover`, `body-lg` type.
- Toasts: bottom-center on mobile, bottom-right on desktop. `dur.slow`.

---

## 9. Interaction principles (preferences, not restrictions)

Earlier drafts called these "rules." They're not — they're the defaults we break deliberately.

### 9.1 Default to calm
- Reduce cognitive load: show only what the current task needs.
- Progressive disclosure: advanced controls appear on demand (the existing `<details>` pattern is good — keep it).
- Subtle transitions, no abrupt UI changes.

### 9.2 When to break the defaults
- **Modals** are fine for focused confirmations (destructive delete, share-with-Paul URL), the import-review step (it's a wizard, modal is correct), and first-run onboarding.
- **Popovers** are fine — and encouraged — for teach-as-you-go explainers and inline menus.
- **Multiple panels in one view** is fine in planning mode (relationships + chemistry curve + beat list). Just don't do it in writing mode.

### 9.3 Loudness budget
Per viewport, budget:
- **≤ 1 gold element** (primary CTA or single active chip).
- **≤ 1 state-success or state-warning banner** (don't stack them).
- Anything else is quiet — ink, muted, hairline, lavender.

---

## 10. Mode indicators

Subtle visual cues confirm which mode the user is in without labels:

- **Planning** — cool overall temperature, hover affordances, card shadows, two-column layouts.
- **Writing** — warm overall temperature, no shadows, single column, autosave indicator is the only persistent chrome.

Implementation detail: the `data-mode` attribute also sets `<meta name="theme-color">` dynamically so mobile browsers' status bars match the mode.

---

## 11. Focus Mode (in-v1 feature)

- Toggle: button in scene focus header, `Esc` to exit, persistent preference in `localStorage` as `ui:focusMode`.
- **Default: off.** Scene focus view opens with the team panel visible. User opts into focus.
- When on:
  - Left sidebar hidden.
  - Team panel hidden (floating reopener bottom-right).
  - Writing column widens to `max-w-3xl`.
  - Surround darkens subtly (`bg-paper` → gradient to `#EDE9E0` at edges) to suggest a vignette.
  - Scene metadata collapsibles auto-close.

---

## 12. Responsive

### 12.1 Breakpoints (Tailwind defaults)
- `< 640px` — mobile, single column, bottom-sheet team panel.
- `640–1024px` — tablet, spine becomes collapsible drawer.
- `> 1024px` — desktop, full three-panel layout.

### 12.2 Mobile-specific
- Writing is primary on mobile. Planning screens are secondary but must not break.
- Scene focus view on mobile: `1rem` Lora body (~40 cpl), `px-4 py-6` padding.
- Team panel becomes a bottom sheet with a persona pill bar; tap a pill to expand the sheet.
- Inline selection actions collapse to the native long-press menu triggered by the Tiptap bubble menu.

---

## 13. Definition of Done

A visual/interaction change is done when:

1. **Mode is respected.** Planning components don't leak onto writing routes; writing components don't leak to planning routes.
2. **Tokens only.** No hex in component files. No `#000`/`#fff` as primary surfaces.
3. **Contrast verified.** Every text/surface pair documented as passing AA.
4. **Motion is on-spec.** Property-scoped transitions, ease + duration from `motion.ts`, reduced-motion honored.
5. **Type is in-system.** Prose uses `prose-writing`; UI uses the `body` scale; labels use `.label-eyebrow`.
6. **Craft concepts are taught.** Any new writer-speak term is wrapped in `<CraftTerm>`.
7. **Dark mode works** (from Phase D5 onward — before D5, planning mode only is OK).
8. **"Would she choose this over a blank Google Doc?"** Gate check. If no: not done.

---

## 14. Implementation phases

Sized against the current build. Each deploys.

| Phase | Scope | Size |
|---|---|---|
| **D0 — Tokens & mode switch** | `globals.css` rewrite (token layers + `data-mode` overrides). Mode detection wrapper in `(app)/layout.tsx` using pathname. `themeColor` meta sync. | ½ day |
| **D1 — Writing mode polish** | Scene focus surfaces → hairline only. Extract `<Chip>`. Soften persona + beat pills. Team panel paper surface. | 1 day |
| **D2 — Spine + dashboard reskin** | Novel-spine rhythm + soft coverage dots. Dashboard progress ring + narrative frame. Beat name as headline. | 1 day |
| **D3 — Focus Mode toggle** | Query-param + localStorage persistence, reopener pill, surround vignette, `focus` easing. | ½ day |
| **D4 — Motion pass** | `src/lib/motion.ts` tokens, replace ad-hoc transitions, wire `tw-animate-css` enter animations, reduced-motion guard. | ½ day |
| **D5 — Dark mode** | Dark token set + `prefers-color-scheme` + settings override. Ships with App Phase 3. | 1 day |

Total: ~4.5 days of design-only work. D0–D4 land before App Phase 3; D5 lands with Phase 3.

---

## 15. Reference products (for team alignment)

| Product | Why it matters |
|---|---|
| Scrivener | Structure + scene hierarchy |
| Ulysses | Writing experience + minimalism |
| iA Writer | Focus mode simplicity |
| Reedsy | Clean publishing UX |
| Plottr | Story visualization |
| Notion | Flexible dashboard patterns (planning-mode reference only) |

---

## 16. Future design hooks (plan-aware, not built)

- Scrivener-style corkboard scene cards.
- AI assistant ambient state (subtle surface shift when persona is "thinking").
- Ambient mode — time-of-day surface variations (dawn/dusk/night) layered onto dark mode.
- Theme variants (fantasy, noir, contemporary) — token-set swaps only; no component changes.
- Reader mode (`/share/[token]`) uses a locked-down writing mode.

---

## 17. The one-line test

> *Would someone choose to write here instead of a blank Google Doc?*

Answer it before every PR merge.
