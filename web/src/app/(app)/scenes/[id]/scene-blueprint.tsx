"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { askPersona } from "@/lib/ai/ask";
import {
  blueprintIsEmpty,
  type SceneBlueprint,
} from "@/lib/scene-blueprint";
import { saveSceneBlueprint } from "../actions";

export function SceneBlueprintSection({
  sceneId,
  initial,
}: {
  sceneId: string;
  initial: SceneBlueprint;
}) {
  const [intent, setIntent] = useState(initial.intent ?? "");
  const [takeaway, setTakeaway] = useState(initial.reader_takeaway ?? "");
  const [shift, setShift] = useState(initial.character_shift ?? "");
  const [notes, setNotes] = useState(initial.research_notes ?? "");
  const [aiText, setAiText] = useState<string>("");
  const [aiError, setAiError] = useState<string>("");
  const [aiPending, setAiPending] = useState(false);
  const [, startSave] = useTransition();

  const hasContent = !blueprintIsEmpty({
    intent,
    reader_takeaway: takeaway,
    character_shift: shift,
    research_notes: notes,
  });

  function save(patch: Partial<SceneBlueprint>) {
    startSave(async () => {
      try {
        await saveSceneBlueprint(sceneId, patch);
      } catch {
        // keep local state; next save will retry
      }
    });
  }

  async function askProfiler() {
    setAiError("");
    setAiPending(true);
    try {
      const prompt = [
        "I am planning a scene before I draft it.",
        intent ? `Current intent: ${intent}` : null,
        takeaway ? `Reader takeaway so far: ${takeaway}` : null,
        shift ? `Character shift so far: ${shift}` : null,
        "Ask me 3-5 short, concrete questions that will sharpen this scene's plan. Use numbered list. No preamble.",
      ]
        .filter(Boolean)
        .join("\n");
      const res = await askPersona({
        personaKey: "profiler",
        userPrompt: prompt,
        sceneId,
      });
      if (res.ok && res.text) setAiText(res.text);
      else setAiError(res.error || "No response.");
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setAiPending(false);
    }
  }

  return (
    <details className="mb-6 rounded-md border p-3 text-sm" open={hasContent}>
      <summary className="label-eyebrow flex cursor-pointer select-none items-center gap-2">
        Scene blueprint — pre-write intent
        {hasContent && (
          <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            planned
          </span>
        )}
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Optional. Sketch what you want this scene to do before drafting. Writing
        then becomes filling in the scope you set.
      </p>

      <div className="mt-3 grid gap-3">
        <BlueprintField
          label="Intent"
          hint="What changes in this scene?"
          value={intent}
          onChange={setIntent}
          onBlur={() => save({ intent: intent.trim() || undefined })}
        />
        <BlueprintField
          label="Reader takeaway"
          hint="What should the reader know or feel by the end?"
          value={takeaway}
          onChange={setTakeaway}
          onBlur={() => save({ reader_takeaway: takeaway.trim() || undefined })}
        />
        <BlueprintField
          label="Character shift"
          hint="What does the POV character know, want, or feel differently after this?"
          value={shift}
          onChange={setShift}
          onBlur={() => save({ character_shift: shift.trim() || undefined })}
        />
        <BlueprintField
          label="Research notes"
          hint="Facts, references, open questions to resolve before drafting."
          value={notes}
          onChange={setNotes}
          onBlur={() => save({ research_notes: notes.trim() || undefined })}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={askProfiler}
          disabled={aiPending}
          className="gap-2"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {aiPending ? "Asking…" : "Ask profiler for guiding questions"}
        </Button>
        {aiError && (
          <span className="text-xs text-destructive">{aiError}</span>
        )}
      </div>

      {aiText && (
        <pre className="mt-3 whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
          {aiText}
        </pre>
      )}
    </details>
  );
}

function BlueprintField({
  label,
  hint,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium">{label}</div>
      <p className="mb-1 text-xs text-muted-foreground">{hint}</p>
      <Textarea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </div>
  );
}
