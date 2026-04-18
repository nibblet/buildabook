"use client";

import { useActionState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  submitFeedback,
  type FeedbackActionState,
} from "@/app/(app)/feedback/actions";

const initial: FeedbackActionState = {};

export function FeedbackForm() {
  const pathname = usePathname();
  const [state, formAction, pending] = useActionState(
    submitFeedback,
    initial,
  );

  if (state.ok) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
        <p className="font-medium text-foreground">Thanks — your note was sent.</p>
        <p className="mt-1 text-muted-foreground">
          Paul can read it in the admin tools when he’s back at the desk.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input
        type="hidden"
        name="page_context"
        value={pathname.slice(0, 240)}
      />
      <div className="space-y-2">
        <Label htmlFor="body">What should improve?</Label>
        <Textarea
          id="body"
          name="body"
          required
          rows={10}
          minLength={3}
          maxLength={12000}
          placeholder="Bugs, confusing UI, something you wish the app did…"
          className="min-h-[200px] resize-y"
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Plain text — saved securely with your account. You can send as many notes as you like.
        </p>
      </div>
      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send feedback"}
      </Button>
    </form>
  );
}
