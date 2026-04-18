"use client";

import { createBrowserClient } from "@supabase/ssr";

// Must read NEXT_PUBLIC_* with static property names so Next.js inlines them
// into the browser bundle. Dynamic access (e.g. process.env[name]) stays empty
// in production client code — see https://nextjs.org/docs/app/building-your-application/configuring/environment-variables#bundling-environment-variables-for-the-browser
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them under Vercel → Settings → Environment Variables (Production / Preview), then redeploy.",
    );
  }
  return createBrowserClient(url, anonKey);
}
