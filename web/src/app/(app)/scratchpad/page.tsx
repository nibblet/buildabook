import { redirect } from "next/navigation";
import { getOrCreateProject } from "@/lib/projects";
import { ScratchpadClient } from "./scratchpad-client";
import { getOrCreateScratchpad } from "./actions";
import type { Proposal } from "@/lib/ai/extract-notes";

export default async function ScratchpadPage() {
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const row = await getOrCreateScratchpad();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Brainstorm
        </p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          Scratchpad
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Write loose notes in Markdown. When you&apos;re ready, have the AI
          propose beats, chapters, and scenes, then pick which to commit to
          your outline.
        </p>
      </header>

      <ScratchpadClient
        initialContent={row.content}
        initialProposal={(row.last_proposal as Proposal | null) ?? null}
        lastPromotedAt={row.last_promoted_at}
      />
    </div>
  );
}
