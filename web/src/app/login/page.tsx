"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AUTH_RETURN_COOKIE } from "@/lib/auth-return-path";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginInner />
    </Suspense>
  );
}

function LoginShell() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Sign in</CardTitle>
        </CardHeader>
        <CardContent className="h-40" />
      </Card>
    </div>
  );
}

function LoginInner() {
  const params = useSearchParams();
  const nextPath = params.get("next") || "/";
  const errorParam = params.get("error");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage(null);
    try {
      const supabase = supabaseBrowser();
      // Prefer NEXT_PUBLIC_APP_URL on Vercel so the redirect matches Supabase allowlist.
      const appBase =
        process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
        window.location.origin;
      // Store return path in a cookie — magic link redirect URL must match allowlist
      // exactly (no ?next=…); query variants often fall back to Supabase “Site URL”.
      const secure = window.location.protocol === "https:";
      document.cookie = [
        `${AUTH_RETURN_COOKIE}=${encodeURIComponent(nextPath)}`,
        "path=/",
        "max-age=600",
        "SameSite=Lax",
        ...(secure ? ["Secure"] : []),
      ].join("; ");
      const redirectTo = `${appBase}/auth/callback`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      );
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Sign in</CardTitle>
          <p className="text-sm text-muted-foreground">
            A magic link will be sent to your email.
          </p>
        </CardHeader>
        <CardContent>
          {errorParam === "not_allowed" && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              That email isn&apos;t on the allowlist. If this is a mistake, ask Paul.
            </div>
          )}
          {status === "sent" ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
              <p className="font-medium">Check your email.</p>
              <p className="mt-1 text-muted-foreground">
                We sent a sign-in link to <span className="font-medium">{email}</span>.
                It will log you in when you click it.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              {message && status === "error" && (
                <p className="text-sm text-destructive">{message}</p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={status === "sending"}
              >
                {status === "sending" ? "Sending…" : "Send magic link"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
