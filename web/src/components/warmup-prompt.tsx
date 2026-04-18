"use client";

import { useMemo } from "react";
import { WARMUP_PROMPTS } from "@/lib/dashboard/warmup-prompts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Rotating warm-up line for the dashboard (Phase 2). */
export function WarmupPromptCard() {
  const prompt = useMemo(() => {
    const i = Math.floor(Math.random() * WARMUP_PROMPTS.length);
    return WARMUP_PROMPTS[i] ?? WARMUP_PROMPTS[0];
  }, []);

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">
          Warm-up
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm leading-relaxed text-foreground">
        {prompt}
      </CardContent>
    </Card>
  );
}
