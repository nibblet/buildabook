import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

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
