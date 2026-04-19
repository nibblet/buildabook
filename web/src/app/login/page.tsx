"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AUTH_SET_PASSWORD_PATH,
  safeInternalPath,
  setBrowserAuthReturnCookie,
} from "@/lib/auth-return-path";

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

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "")
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = safeInternalPath(params.get("next") || "/");
  const errorParam = params.get("error");

  const [emailMagic, setEmailMagic] = useState("");
  const [emailPass, setEmailPass] = useState("");
  const [password, setPassword] = useState("");
  const [magicStatus, setMagicStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [passStatus, setPassStatus] = useState<
    "idle" | "signing_in" | "error"
  >("idle");
  const [resetStatus, setResetStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [messageMagic, setMessageMagic] = useState<string | null>(null);
  const [messagePass, setMessagePass] = useState<string | null>(null);
  const [messageReset, setMessageReset] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [tab, setTab] = useState("magic");

  async function handleMagicSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMagicStatus("sending");
    setMessageMagic(null);
    try {
      const supabase = supabaseBrowser();
      const appBase = appBaseUrl();
      setBrowserAuthReturnCookie(nextPath);
      const redirectTo = `${appBase}/auth/callback`;
      const { error } = await supabase.auth.signInWithOtp({
        email: emailMagic,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setMagicStatus("sent");
    } catch (err) {
      setMagicStatus("error");
      setMessageMagic(
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      );
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPassStatus("signing_in");
    setMessagePass(null);
    try {
      const supabase = supabaseBrowser();
      setBrowserAuthReturnCookie(nextPath);
      const { error } = await supabase.auth.signInWithPassword({
        email: emailPass,
        password,
      });
      if (error) throw error;
      router.refresh();
      router.replace(nextPath);
    } catch (err) {
      setPassStatus("error");
      setMessagePass(
        err instanceof Error ? err.message : "Sign-in failed. Try again.",
      );
    }
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResetStatus("sending");
    setMessageReset(null);
    try {
      const supabase = supabaseBrowser();
      const appBase = appBaseUrl();
      if (!appBase) {
        throw new Error("App URL is not configured.");
      }
      setBrowserAuthReturnCookie(AUTH_SET_PASSWORD_PATH);
      const { error } = await supabase.auth.resetPasswordForEmail(
        emailPass.trim(),
        { redirectTo: `${appBase}/auth/callback` },
      );
      if (error) throw error;
      setResetStatus("sent");
    } catch (err) {
      setResetStatus("error");
      setMessageReset(
        err instanceof Error ? err.message : "Could not send reset email.",
      );
    }
  }

  function onTabChange(value: string) {
    setTab(value);
    setShowReset(false);
    setMessagePass(null);
    setMessageReset(null);
    setResetStatus("idle");
    setPassStatus("idle");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          {errorParam === "not_allowed" && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              That email isn&apos;t on the allowlist. If this is a mistake, ask
              Paul.
            </div>
          )}
          <Tabs value={tab} onValueChange={onTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="magic">Magic link</TabsTrigger>
              <TabsTrigger value="password">Email &amp; password</TabsTrigger>
            </TabsList>
            <TabsContent value="magic" className="mt-4">
              <p className="mb-4 text-sm text-muted-foreground">
                We&apos;ll email you a one-time link. No password needed.
              </p>
              {magicStatus === "sent" ? (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
                  <p className="font-medium">Check your email.</p>
                  <p className="mt-1 text-muted-foreground">
                    We sent a sign-in link to{" "}
                    <span className="font-medium">{emailMagic}</span>. It will
                    log you in when you click it.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleMagicSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email-magic">Email</Label>
                    <Input
                      id="email-magic"
                      type="email"
                      autoComplete="email"
                      required
                      value={emailMagic}
                      onChange={(e) => setEmailMagic(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  {messageMagic && magicStatus === "error" && (
                    <p className="text-sm text-destructive">{messageMagic}</p>
                  )}
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={magicStatus === "sending"}
                  >
                    {magicStatus === "sending" ? "Sending…" : "Send magic link"}
                  </Button>
                </form>
              )}
            </TabsContent>
            <TabsContent value="password" className="mt-4">
              {showReset ? (
                <>
                  <p className="mb-4 text-sm text-muted-foreground">
                    Works for a forgotten password or to add a password if you
                    usually use a magic link. We&apos;ll email you a link to
                    choose a password—no admin needed.
                  </p>
                  {resetStatus === "sent" ? (
                    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
                      <p className="font-medium">Check your email.</p>
                      <p className="mt-1 text-muted-foreground">
                        We sent a link to{" "}
                        <span className="font-medium">{emailPass}</span>. After
                        you open it, you&apos;ll set your password here.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4 w-full"
                        onClick={() => {
                          setResetStatus("idle");
                          setShowReset(false);
                          setMessageReset(null);
                        }}
                      >
                        Back to sign in
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={handleResetSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="email-reset">Email</Label>
                        <Input
                          id="email-reset"
                          type="email"
                          autoComplete="email"
                          required
                          value={emailPass}
                          onChange={(e) => setEmailPass(e.target.value)}
                          placeholder="you@example.com"
                        />
                      </div>
                      {messageReset && resetStatus === "error" && (
                        <p className="text-sm text-destructive">
                          {messageReset}
                        </p>
                      )}
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={resetStatus === "sending"}
                      >
                        {resetStatus === "sending"
                          ? "Sending…"
                          : "Email me a link"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        onClick={() => {
                          setShowReset(false);
                          setMessageReset(null);
                          setResetStatus("idle");
                        }}
                      >
                        Cancel
                      </Button>
                    </form>
                  )}
                </>
              ) : (
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email-pass">Email</Label>
                    <Input
                      id="email-pass"
                      type="email"
                      autoComplete="email"
                      required
                      value={emailPass}
                      onChange={(e) => setEmailPass(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  {messagePass && passStatus === "error" && (
                    <p className="text-sm text-destructive">{messagePass}</p>
                  )}
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={passStatus === "signing_in"}
                  >
                    {passStatus === "signing_in" ? "Signing in…" : "Sign in"}
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto w-full p-0 text-sm text-muted-foreground"
                    onClick={() => {
                      setShowReset(true);
                      setMessagePass(null);
                      setPassStatus("idle");
                    }}
                  >
                    Forgot password or set a password for your account
                  </Button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
