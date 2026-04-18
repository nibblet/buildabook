# Write (`write.forvex.app`)

A guided writing studio for a paranormal-romance novella. Phase 0 — the
walking skeleton — matches section 18 of
[`files/novella-app-architecture-v2.md`](../files/novella-app-architecture-v2.md).

Stack:

- Next.js 16 App Router, TypeScript, Tailwind v4, shadcn/ui-style components
- Supabase (Postgres + Auth + RLS) — **one** project for this app (e.g. `paul_personal`)
- Anthropic Claude Sonnet 4.5 (Partner + Profiler) / Haiku 4.5 (Analyst later)
- TipTap prose editor
- Deployed on Vercel (`write.forvex.app`)

## Quick start

### 1. One Supabase project

Use a single Supabase project for production data. Run the migration once:

```bash
# In Supabase → SQL Editor, paste and run:
#   ../supabase/migrations/0001_init.sql
```

Authentication → URL Configuration:

- **Site URL:** primary app origin (fallback when a redirect is invalid). For this deployment use your real Vercel URL (e.g. `https://….vercel.app`) or production domain — **not** another app’s URL, or magic links can bounce there. Use **https**, not http.
- **Redirect URLs:** must include **exactly** `https://<your-app>/auth/callback` (no query string required). Magic link uses that URL; return path is stored in a short-lived cookie. Add each app that shares this Supabase project (e.g. `http://localhost:3000/auth/callback` for local).

**Keeping it private:** Sign-in uses Supabase Auth (magic link). Row Level Security ties data to `auth.uid()`. In production, set **`APP_ALLOWED_EMAILS`** in Vercel (comma-separated); anyone not listed gets signed out immediately after login. Leave it empty only if you intentionally want **any** email that completes magic-link auth to use the app. **`APP_ADMIN_EMAILS`** grants `/admin` without needing to appear on the allowlist.

### 2. Configure env

```bash
cp .env.example .env.local
# Fill in Supabase + Anthropic values. APP_ALLOWED_EMAILS = her email.
# APP_ADMIN_EMAILS = Paul's email.
```

### 3. Install & run

```bash
npm install
npm run dev
# open http://localhost:3000
```

First sign-in: enter her email, click the magic link, land on `/onboarding`,
paste chapter 1, review, save. You're writing.

## Phase 0 ships

- Import-first onboarding (`/onboarding`)
- Novel Spine read-only tree (Act → Beat → Chapter → Scene)
- Dashboard v1 (where you are · progress · what's next)
- Chapter editor (`/chapters/[id]`) with scene cards
- Scene focus mode (`/scenes/[id]`) with autosave + TipTap
- Beat detail (`/beats/[id]`) with "why this beat matters" explainer
- Team panel: The Partner + The Profiler
- `ai_interactions` logging + `/admin` (feature-flagged by email)
- PWA manifest (add-to-home-screen on the phone)
- Email allowlist middleware

Explicitly **not** in Phase 0 (see v2 §18):

- The Specialist / Proofreader / Analyst personas
- Editable beats, drag-reorder, inline selection actions
- Voyage AI embeddings + RAG
- Fact Check / consistency
- Relationship beats + chemistry curve
- Reader mode / share
- `.docx` export

## Deploy (single production environment)

- **Git:** use feature branches and merge to `main` when ready; avoid risky schema changes without testing the migration in SQL Editor on a backup mindset first.
- **Vercel:** Set **Root Directory** to **`web`** (repo root has no `package.json`; the Next app is in `web/`). Production points at `write.forvex.app`; env vars reference your **one** Supabase project.
- Optional Vercel previews can use the **same** Supabase keys if you accept that previews hit real data — many teams disable previews for auth apps or keep preview deploys branch-only locally. Pick what matches your risk tolerance.

No separate staging Supabase project is required for this repo’s documented setup.
