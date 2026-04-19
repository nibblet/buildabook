"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Loader2, ChevronLeft, Maximize2, Minimize2, RotateCcw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFocusMode } from "@/hooks/use-focus-mode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Chip } from "@/components/ui/chip";
import { ProseEditor, type ProseEditorHandle } from "@/components/prose-editor";
import { TeamPanel } from "@/components/team-panel";
import {
  restoreSceneRevision,
  saveSceneContent,
  updateSceneCharacterArc,
  updateSceneFields,
} from "../actions";
import { cn, formatNumber } from "@/lib/utils";
import { stripHtml } from "@/lib/html";
import { idsMatchingMentionsInText } from "@/lib/mentions/character-mention-backfill";
import {
  type WritingProfileId,
  parseWritingProfile,
} from "@/lib/deployment/writing-profile";
import type {
  Beat,
  Chapter,
  Character,
  Project,
  Scene,
  SceneCharacterArc,
  SceneRevision,
} from "@/lib/supabase/types";

type SaveState = "idle" | "saving" | "saved" | "error";

export function SceneFocusClient({
  project,
  scene,
  chapter,
  characters,
  beats,
  arcs,
  revisions,
  BackLink,
}: {
  project: Project;
  scene: Scene;
  chapter: Pick<Chapter, "id" | "title">;
  characters: Character[];
  beats: Beat[];
  arcs: SceneCharacterArc[];
  revisions: SceneRevision[];
  backHref?: string;
  BackLink: React.ReactNode;
}) {
  const router = useRouter();
  const editorRef = useRef<ProseEditorHandle>(null);
  const { focusMode, toggle: toggleFocus } = useFocusMode();
  const writingProfile = parseWritingProfile(project.writing_profile);

  const [title, setTitle] = useState(scene.title ?? "");
  const [goal, setGoal] = useState(scene.goal ?? "");
  const [conflict, setConflict] = useState(scene.conflict ?? "");
  const [outcome, setOutcome] = useState(scene.outcome ?? "");
  const [wordcount, setWordcount] = useState(scene.wordcount ?? 0);
  const [contentHtml, setContentHtml] = useState(scene.content ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [beatIds, setBeatIds] = useState<string[]>(scene.beat_ids ?? []);
  const [mentionQuery, setMentionQuery] = useState("");
  const [selectedRevisionId, setSelectedRevisionId] = useState(revisions[0]?.id ?? "");
  const [arcDrafts, setArcDrafts] = useState<Record<string, {
    reader_knowledge: string;
    character_knowledge: string;
    arc_note: string;
  }>>(() =>
    arcs.reduce<Record<string, { reader_knowledge: string; character_knowledge: string; arc_note: string }>>(
      (acc, arc) => {
        acc[arc.character_id] = {
          reader_knowledge: arc.reader_knowledge ?? "",
          character_knowledge: arc.character_knowledge ?? "",
          arc_note: arc.arc_note ?? "",
        };
        return acc;
      },
      {},
    ),
  );
  const [, startTransition] = useTransition();
  const dirtyRef = useRef(false);
  const metaDirtyRef = useRef(false);

  const povCharacter = characters.find((c) => c.id === scene.pov_character_id);
  const sceneBeats = beats.filter((b) => beatIds.includes(b.id));
  const mentionedCharacterIds = idsMatchingMentionsInText(
    stripHtml(contentHtml ?? "").toLowerCase(),
    characters,
  );
  /** Full project cast — arc rows are optional notes per scene (not seeded). */
  const trackedCharacters = [...characters].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const selectedRevision = revisions.find((r) => r.id === selectedRevisionId) ?? null;

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

  function insertCharacterMention() {
    const q = mentionQuery.trim().toLowerCase();
    if (!q) return;
    const match = characters.find((c) => c.name.toLowerCase() === q)
      ?? characters.find((c) => c.name.toLowerCase().startsWith(q));
    if (!match) return;
    editorRef.current?.insertAtCursor(`@${match.name} `);
    setMentionQuery("");
  }

  function updateArcDraft(
    characterId: string,
    field: "reader_knowledge" | "character_knowledge" | "arc_note",
    value: string,
  ) {
    setArcDrafts((prev) => ({
      ...prev,
      [characterId]: {
        reader_knowledge: prev[characterId]?.reader_knowledge ?? "",
        character_knowledge: prev[characterId]?.character_knowledge ?? "",
        arc_note: prev[characterId]?.arc_note ?? "",
        [field]: value,
      },
    }));
  }

  function persistArc(characterId: string) {
    const draft = arcDrafts[characterId];
    if (!draft) return;
    startTransition(async () => {
      await updateSceneCharacterArc(scene.id, characterId, {
        reader_knowledge: draft.reader_knowledge || null,
        character_knowledge: draft.character_knowledge || null,
        arc_note: draft.arc_note || null,
      });
    });
  }

  function onRestoreRevision() {
    if (!selectedRevisionId) return;
    startTransition(async () => {
      await restoreSceneRevision(scene.id, selectedRevisionId);
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "grid min-h-[calc(100vh-0px)] grid-rows-[auto_1fr]",
        focusMode
          ? "md:grid-cols-1 md:grid-rows-1"
          : "md:grid-cols-[1fr_22rem] md:grid-rows-1",
      )}
    >
      <div className="flex min-h-0 flex-col border-b md:border-b-0 md:border-r">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {!focusMode && (BackLink ?? (
              <Link
                href={`/chapters/${chapter.id}`}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <ChevronLeft className="h-3 w-3" /> {chapter.title || "Chapter"}
              </Link>
            ))}
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
            {!focusMode && (
              <Button size="sm" variant="outline" onClick={markDone}>
                Mark scene done
              </Button>
            )}
            <button
              type="button"
              onClick={toggleFocus}
              title={focusMode ? "Exit focus mode (Esc)" : "Enter focus mode"}
              className="inline-flex items-center gap-1 rounded px-2 py-1 transition-colors hover:bg-accent hover:text-foreground"
            >
              {focusMode ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">
                {focusMode ? "Exit focus" : "Focus"}
              </span>
            </button>
          </div>
        </div>

        <div
          className={cn(
            "mx-auto w-full flex-1 overflow-y-auto px-6 py-8",
            focusMode ? "max-w-3xl" : "max-w-2xl",
          )}
        >
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              metaDirtyRef.current = true;
            }}
            placeholder="Scene title (optional)"
            className="mb-6 h-auto border-0 bg-transparent px-0 text-xl font-semibold shadow-none focus-visible:ring-0"
          />

          <details className="mb-6 rounded-md border p-3 text-sm" open>
            <summary className="label-eyebrow cursor-pointer select-none">
              Story beats — what milestone does this scene advance?
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Beats are checkpoints (Ordinary World, Meet Cute, …), not chapter
              titles. Tag each scene so the left spine shows progression the way you
              intend — this scene is listed under every beat you select. Untagged scenes
              stay grouped under this chapter&apos;s primary beat only.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {beats.map((b) => (
                <Chip
                  key={b.id}
                  active={beatIds.includes(b.id)}
                  onClick={() => toggleBeat(b.id)}
                >
                  {b.title}
                </Chip>
              ))}
            </div>
          </details>

          <details className="mb-6 rounded-md border p-3 text-sm">
            <summary className="label-eyebrow cursor-pointer select-none">
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

          <details className="mt-6 rounded-md border p-3 text-sm">
            <summary className="label-eyebrow cursor-pointer select-none">
              Character mentions — insert and track
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              Use <span className="font-mono">@Name</span> in prose to keep cast continuity searchable.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input
                list="character-mentions"
                value={mentionQuery}
                onChange={(e) => setMentionQuery(e.target.value)}
                placeholder="Type a character name…"
                className="max-w-xs"
              />
              <datalist id="character-mentions">
                {characters.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
              <Button type="button" size="sm" variant="outline" onClick={insertCharacterMention}>
                Insert @character
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {mentionedCharacterIds.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  No explicit @mentions in this scene yet.
                </span>
              ) : (
                mentionedCharacterIds.map((id) => {
                  const c = characters.find((x) => x.id === id);
                  if (!c) return null;
                  return (
                    <Chip key={c.id} active>
                      @{c.name}
                    </Chip>
                  );
                })
              )}
            </div>
          </details>

          <details className="mt-6 rounded-md border p-3 text-sm">
            <summary className="label-eyebrow cursor-pointer select-none">
              Arc tracker — reader vs character knowledge
            </summary>
            {trackedCharacters.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Add characters under <strong className="text-foreground">Characters</strong> to
                track arc state here. Notes save when you leave a field (blur).
              </p>
            ) : (
              <div className="mt-3 space-y-4">
                {trackedCharacters.map((c) => {
                  const draft = arcDrafts[c.id] ?? {
                    reader_knowledge: "",
                    character_knowledge: "",
                    arc_note: "",
                  };
                  return (
                    <div key={c.id} className="rounded-md border p-3">
                      <p className="text-sm font-medium">{c.name}</p>
                      <div className="mt-2 grid gap-2">
                        <SceneField
                          label="What the reader knows"
                          hint="Truth currently visible to the reader."
                          value={draft.reader_knowledge}
                          onChange={(v) => updateArcDraft(c.id, "reader_knowledge", v)}
                          onBlur={() => persistArc(c.id)}
                        />
                        <SceneField
                          label="What this character knows"
                          hint="Internal knowledge at this point in story time."
                          value={draft.character_knowledge}
                          onChange={(v) => updateArcDraft(c.id, "character_knowledge", v)}
                          onBlur={() => persistArc(c.id)}
                        />
                        <SceneField
                          label="Arc note"
                          hint="Reveal, shift, or contradiction to revisit later."
                          value={draft.arc_note}
                          onChange={(v) => updateArcDraft(c.id, "arc_note", v)}
                          onBlur={() => persistArc(c.id)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </details>

          <details className="mt-6 rounded-md border p-3 text-sm">
            <summary className="label-eyebrow cursor-pointer select-none">
              Revision history
            </summary>
            {revisions.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Revisions appear after scene content changes are autosaved.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    value={selectedRevisionId}
                    onChange={(e) => setSelectedRevisionId(e.target.value)}
                  >
                    {revisions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {new Date(r.created_at).toLocaleString()} · {formatNumber(r.wordcount)} words
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={onRestoreRevision}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore revision
                  </Button>
                </div>
                {selectedRevision ? (
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">
                      Diff summary:{" "}
                      {diffSummary(stripHtml(contentHtml), stripHtml(selectedRevision.content))}
                    </p>
                    <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                      {stripHtml(selectedRevision.content).slice(0, 1800) || "(No text in selected revision)"}
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </details>
        </div>
      </div>

      {!focusMode && (
        <aside className="min-h-0 overflow-y-auto border-t bg-card/60 p-4 backdrop-blur-sm md:border-t-0">
          <TeamPanel
            writingProfile={writingProfile}
            sceneId={scene.id}
            chapterId={chapter.id}
            aliases={project.persona_aliases}
            onInsertProse={(text) => {
              editorRef.current?.insertAtCursor(text);
            }}
          />
        </aside>
      )}

      {/* Floating team reopener in focus mode */}
      {focusMode && (
        <FloatingTeamReopener
          writingProfile={writingProfile}
          sceneId={scene.id}
          chapterId={chapter.id}
          aliases={project.persona_aliases}
          onInsertProse={(text) => editorRef.current?.insertAtCursor(text)}
        />
      )}
    </div>
  );
}

function FloatingTeamReopener({
  writingProfile,
  sceneId,
  chapterId,
  aliases,
  onInsertProse,
}: {
  writingProfile: WritingProfileId;
  sceneId: string;
  chapterId: string;
  aliases: Project["persona_aliases"];
  onInsertProse: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-80 rounded-xl border bg-card/95 p-4 shadow-lg backdrop-blur-sm">
          <TeamPanel
            writingProfile={writingProfile}
            sceneId={sceneId}
            chapterId={chapterId}
            aliases={aliases}
            onInsertProse={onInsertProse}
          />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close team panel" : "Open team panel"}
        className={cn(
          "inline-flex h-10 w-10 items-center justify-center rounded-full border shadow-md transition-colors",
          open
            ? "bg-primary text-primary-foreground"
            : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <Sparkles className="h-4 w-4" />
      </button>
    </div>
  );
}

function SceneField({
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
  onBlur?: () => void;
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
        onBlur={onBlur}
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

function diffSummary(currentText: string, selectedRevisionText: string): string {
  const currentWords = currentText.trim().split(/\s+/).filter(Boolean).length;
  const previousWords = selectedRevisionText.trim().split(/\s+/).filter(Boolean).length;
  const delta = currentWords - previousWords;
  if (delta === 0) return "wordcount unchanged from current scene.";
  if (delta > 0) return `${formatNumber(delta)} words added since this revision.`;
  return `${formatNumber(Math.abs(delta))} words removed since this revision.`;
}
