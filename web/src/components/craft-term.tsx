"use client";

import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CRAFT_GLOSSARY } from "@/lib/teach/glossary";

/** Wrap UI copy with an optional teach-as-you-go tooltip (desktop hover / mobile tap). */
export function CraftTerm({
  term,
  slug,
  children,
}: {
  /** Fallback label when slug not in glossary */
  term?: string;
  slug?: keyof typeof CRAFT_GLOSSARY | string;
  children: ReactNode;
}) {
  const entry =
    slug && slug in CRAFT_GLOSSARY
      ? CRAFT_GLOSSARY[slug as keyof typeof CRAFT_GLOSSARY]
      : null;

  if (!entry) {
    return <>{children}</>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help border-b border-dotted border-muted-foreground/60">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-left leading-snug">
        <span className="font-medium">{entry.title}</span>
        <p className="mt-1 text-muted-foreground">{entry.body}</p>
      </TooltipContent>
    </Tooltip>
  );
}
