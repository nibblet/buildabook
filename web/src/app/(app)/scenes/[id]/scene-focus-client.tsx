"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Loader2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ProseEditor, type ProseEditorHandle } from "@/components/prose-editor";
import { TeamPanel } from "@/components/team-panel";
import { saveSceneContent, updateSceneFields } from "../actions";
import { cn, formatNumber } from "@/lib/utils";
import type {
  Beat,
  Chapter,
  Character,
  Project,
  Scene,
} from "@/lib/supabase/types";

type SaveState = "idle" | "saving" | "saved" | "error";

export function SceneFocusClient({
  project,
  scene,
  chapter,
  characters,
  beats,
  BackLink,
}: {
  project: Project;
  scene: Scene;
  chapter: Pick<Chapter, "id" | "title">;
  characters: Character[];
  beats: Beat[];
  backHref?: string;
  BackLink: React.ReactNode;
}) {
  const editorRef = useRef<ProseEditorHandle>(null);

  const [title, setTitle] = useState(scene.title ?? "");
  const [goal, setGoal] = useState(scene.goal ?? "");
  const [conflict, setConflict] = useState(scene.conflict ?? "");
  const [outcome, setOutcome] = useState(scene.outcome ?? "");
  const [wordcount, setWordcount] = useState(scene.wordcount ?? 0);
  const [contentHtml, setContentHtml] = useState(scene.content ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [beatIds, setBeatIds] = useState<string[]>(scene.beat_ids ?? []);
  const [, startTransition] = useTransition();
  const dirtyRef = useRef(false);
  const metaDirtyRef = useRef(false);

  const povCharacter = characters.find((c) => c.id === scene.pov_character_id);
  const sceneBeats = beats.filter((b) => beatIds.includes(b.id));

  function toggleBeat(beatId: string) {
    setBeatIds((prev) =>
      prev.includes(beatId)
        ? prev.filter((id) => id !== beatId)
        : [...prev, beatId],
    );
    metaDirtyRef.current = true;
  }

  const persist = useCallback(
    async (html: string, words: number) => {
      setSaveState("saving");
      try {
        await saveSceneContent(scene.id, html, words);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [scene.id],
  );

  // Debounced autosave on prose change.
  useEffect(() => {
    if (!dirtyRef.current) return;
    const t = setTimeout(() => {
      dirtyRef.current = false;
      startTransition(() => persist(contentHtml, wordcount));
    }, 900);
    return () => clearTimeout(t);
  }, [contentHtml, wordcount, persist]);

  // Debounced save on meta fields.
  useEffect(() => {
    if (!metaDirtyRef.current) return;
    const t = setTimeout(() => {
      metaDirtyRef.current = false;
      startTransition(async () => {
        await updateSceneFields(scene.id, {
          title: title || null,
          goal: goal || null,
          conflict: conflict || null,
          outcome: outcome || null,
          beat_ids: beatIds,
        });
      });
    }, 800);
    return () => clearTimeout(t);
  }, [title, goal, conflict, outcome, beatIds, scene.id]);

  function onProseChange(html: string, _text: string, words: number) {
    void _text;
    setContentHtml(html);
    setWordcount(words);
    dirtyRef.current = true;
    setSaveState("idle");
  }

  function markDone() {
    startTransition(async () => {
      await updateSceneFields(scene.id, { status: "done" });
    });
  }

  return (
    <div className="grid min-h-[calc(100vh-0px)] grid-rows-[auto_1fr] md:grid-cols-[1fr_22rem] md:grid-rows-1">
      <div className="flex min-h-0 flex-col border-b md:border-b-0 md:border-r">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {BackLink ?? (
              <Link
                href={`/chapters/${chapter.id}`}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <ChevronLeft className="h-3 w-3" /> {chapter.title || "Chapter"}
              </Link>
            )}
            {sceneBeats.length > 0 && (
              <span>
                · Beat:{" "}
                <span className="text-foreground">
                  {sceneBeats.map((b) => b.title).join(" · ")}
                </span>
              </span>
            )}
            {povCharacter && (
              <span>
                · POV:{" "}
                <span className="text-foreground">{povCharacter.name}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {formatNumber(wordcount)} {wordcount === 1 ? "word" : "words"}
            </span>
            <SaveBadge state={saveState} />
            <Button size="sm" variant="outline" onClick={markDone}>
              Mark scene done
            </Button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-6 py-8">
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              metaDirtyRef.current = true;
            }}
            placeholder="Scene title (optional)"
            className="mb-6 h-auto border-0 bg-transparent px-0 text-xl font-semibold shadow-none focus-visible:ring-0"
          />

          <details className="mb-6 rounded-md border bg-muted/30 p-3 text-sm" open>
            <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Story beats — what milestone does this scene advance?
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Beats are checkpoints (Ordinary World, Meet Cute, …), not chapter
              titles.               Tag each scene so the left spine shows progression the way you
              intend — this scene is listed under every beat you select. Untagged scenes
              stay grouped under this chapter&apos;s primary beat only.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {beats.map((b) => {
                const on = beatIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBeat(b.id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background hover:bg-accent",
                    )}
                  >
                    {b.title}
                  </button>
                );
              })}
            </div>
          </details>

          <details className="mb-6 rounded-md border bg-muted/30 p-3 text-sm">
            <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Scene card — goal · conflict · outcome
            </summary>
            <div className="mt-3 grid gap-2">
              <SceneField
                label="Goal"
                hint="What the POV character wants in this scene."
                value={goal}
                onChange={(v) => {
                  setGoal(v);
                  metaDirtyRef.current = true;
                }}
              />
              <SceneField
                label="Conflict"
                hint="What's in the way."
                value={conflict}
                onChange={(v) => {
                  setConflict(v);
                  metaDirtyRef.current = true;
                }}
              />
              <SceneField
                label="Outcome"
                hint="How it ends. Win / lose / win-but."
                value={outcome}
                onChange={(v) => {
                  setOutcome(v);
                  metaDirtyRef.current = true;
                }}
              />
            </div>
          </details>

          <ProseEditor
            ref={editorRef}
            sceneId={scene.id}
            chapterId={chapter.id}
            enableInlineAssist
            initialContent={scene.content ?? ""}
            placeholder="Start writing…"
            autofocus
            onChange={onProseChange}
          />
        </div>
      </div>

      <aside className="min-h-0 overflow-y-auto border-t bg-muted/20 p-4 md:border-t-0">
        <TeamPanel
          sceneId={scene.id}
          chapterId={chapter.id}
          aliases={project.persona_aliases}
          onInsertProse={(text) => {
            editorRef.current?.insertAtCursor(text);
          }}
        />
      </aside>
    </div>
  );
}

function SceneField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium">
        {label}
        <span className="ml-2 font-normal text-muted-foreground">{hint}</span>
      </Label>
      <Textarea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "saving")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving
      </span>
    );
  if (state === "saved")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
        <Check className="h-3 w-3" /> Saved
      </span>
    );
  if (state === "error")
    return (
      <span className="text-xs text-destructive">Error saving</span>
    );
  return null;
}
