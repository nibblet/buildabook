import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  AUTH_RETURN_COOKIE,
  safeInternalPath,
} from "@/lib/auth-return-path";

// Handles the magic-link callback. Supabase sends the user here with either
// `code` (PKCE) or `token_hash` + `type` query params depending on flow.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const cookieNext = req.cookies.get(AUTH_RETURN_COOKIE)?.value;
  const queryNext = url.searchParams.get("next");
  const nextPath = safeInternalPath(cookieNext ?? queryNext ?? undefined);

  const supabase = await supabaseServer();

  function redirectAfterAuth() {
    const target = new URL(nextPath, url.origin);
    const res = NextResponse.redirect(target);
    res.cookies.set(AUTH_RETURN_COOKIE, "", {
      path: "/",
      maxAge: 0,
    });
    return res;
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
      );
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "email" | "magiclink" | "signup" | "recovery",
      token_hash: tokenHash,
    });
    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
      );
    }
  } else {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  return redirectAfterAuth();
}
