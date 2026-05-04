import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * Route handlers that return a custom `NextResponse` (e.g. redirects) must bind
 * Supabase cookie writes to that response. Using only `cookies()` from
 * `next/headers` can omit `Set-Cookie` on the redirect response.
 */
export function supabaseRouteHandler(req: NextRequest, response: NextResponse) {
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options ?? {});
        });
        Object.entries(headers ?? {}).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });
}

// Server-side Supabase client, bound to the current request cookies.
// Use inside Server Components, Server Actions, and Route Handlers.
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — next/headers will throw. We
          // rely on middleware to refresh the session in that case.
        }
      },
    },
  });
}

// Admin client using the service-role key. Only call from server-only code
// paths that genuinely need to bypass RLS (rare: seeding, admin dashboards).
export async function supabaseAdmin() {
  const key = env.supabaseServiceRoleKey();
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set; admin client unavailable.",
    );
  }
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(env.supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
