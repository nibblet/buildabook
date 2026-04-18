import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/login";
  return raw;
}

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  const url = new URL(req.url);
  const next = safeNextPath(url.searchParams.get("next"));
  return NextResponse.redirect(new URL(next, req.url));
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url));
}
