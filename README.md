# buildabook

Monorepo for the "Write" novella-writing app.

```
buildabook/
├── web/                 Next.js 16 app (the studio UI)
├── supabase/            SQL migrations (run once against your Supabase project)
├── files/               Architecture + world-bible docs
└── README.md
```

Start here → [`web/README.md`](./web/README.md).

Architecture → [`files/novella-app-architecture-v2.md`](./files/novella-app-architecture-v2.md).

### Vercel

The Next.js app lives under **`web/`**. Root [`vercel.json`](./vercel.json) installs and builds from there. In the Vercel project, leave **Root Directory** empty (repository root), or alternatively set Root Directory to **`web`** and remove the custom `installCommand` / `buildCommand` from `vercel.json` at the repo root (that root file is ignored when Root Directory is `web`).

Phase 0 — the walking skeleton — is what's built right now.
