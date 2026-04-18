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

The Next.js app lives under **`web/`**. In the Vercel dashboard open **Project → Settings → Build and Deployment → Root Directory**, click **Edit**, set it to **`web`**, then **Save**. Use the default install/build commands (`npm ci` / `npm run build`); Vercel will detect Next.js from `web/package.json`. Env vars belong on that same project (Production / Preview).

Phase 0 — the walking skeleton — is what's built right now.
