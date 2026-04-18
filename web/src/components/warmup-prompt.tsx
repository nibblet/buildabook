"use client";

import { useEffect, useState } from "react";
import { WARMUP_PROMPTS } from "@/lib/dashboard/warmup-prompts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Rotating warm-up line for the dashboard. Picked client-side to avoid SSR mismatch. */
export function WarmupPromptCard() {
  const [prompt, setPrompt] = useState<string | null>(null);

  useEffect(() => {
    const i = Math.floor(Math.random() * WARMUP_PROMPTS.length);
    setPrompt(WARMUP_PROMPTS[i] ?? WARMUP_PROMPTS[0] ?? null);
  }, []);

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="label-eyebrow">Warm-up</CardTitle>
      </CardHeader>
      <CardContent className="text-sm leading-relaxed text-foreground">
        {prompt ?? <span className="text-muted-foreground">Loading…</span>}
      </CardContent>
    </Card>
  );
}
