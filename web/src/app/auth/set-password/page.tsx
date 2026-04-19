"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const MIN_LEN = 8;

export default function SetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = supabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!cancelled) {
        setHasSession(!!session);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (password.length < MIN_LEN) {
      setStatus("error");
      setMessage(`Use at least ${MIN_LEN} characters.`);
      return;
    }
    if (password !== confirm) {
      setStatus("error");
      setMessage("Passwords do not match.");
      return;
    }
    setStatus("saving");
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      router.refresh();
      router.replace("/");
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error ? err.message : "Could not update password.",
      );
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl">Set password</CardTitle>
          </CardHeader>
          <CardContent className="h-32" />
        </Card>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl">Link expired or invalid</CardTitle>
            <CardDescription>
              Request a new link from the sign-in page under &quot;Forgot
              password&quot; (or sign in with a magic link).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/login">Back to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Choose a password</CardTitle>
          <CardDescription>
            You can use this email and password next time instead of a magic
            link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_LEN}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_LEN}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {message && status === "error" && (
              <p className="text-sm text-destructive">{message}</p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={status === "saving"}
            >
              {status === "saving" ? "Saving…" : "Save password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
