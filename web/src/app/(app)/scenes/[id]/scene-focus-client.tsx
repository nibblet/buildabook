"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Loader2, ChevronLeft, Maximize2, Minimize2, RotateCcw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFocusMode } from "@/hooks/use-focus-mode";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Chip } from "@/components/ui/chip";
import type { ContinuityDial } from "@/lib/ai/continuity/dial";
import { paragraphsFromPlainText } from "@/lib/ai/continuity/paragraph-range";
import { extractContinuityWholeSceneAction } from "@/app/(app)/scenes/[id]/continuity/actions";
import { ProseEditor, type ProseEditorHandle } from "@/components/prose-editor";
import { TeamPanel } from "@/components/team-panel";
import {
  renameEntityFromScene,
  restoreSceneRevision,
  saveSceneContent,
  updateSceneCharacterArc,
  updateSceneFields,
} from "../actions";
import { SceneBlueprintSection } from "./scene-blueprint";
import { parseSceneBlueprint } from "@/lib/scene-blueprint";
import { cn, formatNumber } from "@/lib/utils";
import { prosePlainFingerprint, stripHtml } from "@/lib/html";
import {
  cacheSceneSnapshot,
  clearOutboxUpTo,
  enqueueSceneSave,
} from "@/lib/offline/repo";
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
  WorldElement,
} from "@/lib/supabase/types";

type SaveState = "idle" | "saving" | "saved" | "error";

const WHOLE_SCENE_EXTRACT_PARAGRAPH_WARN = 20;

function countProseParagraphs(html: string): number {
  const plain = stripHtml(html)
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  return paragraphsFromPlainText(plain).filter((p) => p.trim()).length;
}

function scenePlanningIncomplete(goal: string, conflict: string, outcome: string) {
  return !(goal.trim() && conflict.trim() && outcome.trim());
}

export function SceneFocusClient({
  project,
  scene,
  chapter,
  characters,
  beats,
  arcs,
  revisions,
  worldElements,
  BackLink,
}: {
  project: Project;
  scene: Scene;
  chapter: Pick<Chapter, "id" | "title">;
  characters: Character[];
  beats: Beat[];
  arcs: SceneCharacterArc[];
  revisions: SceneRevision[];
  worldElements?: WorldElement[];
  backHref?: string;
  BackLink: React.ReactNode;
}) {
  const router = useRouter();
  const editorRef = useRef<ProseEditorHandle>(null);
  const { focusMode, toggle: toggleFocus } = useFocusMode();
  const writingProfile = parseWritingProfile(project.writing_profile);
  const continuityDial: ContinuityDial =
    project.continuity_dial ?? "helpful";

  const [title, setTitle] = useState(scene.title ?? "");
  const [goal, setGoal] = useState(scene.goal ?? "");
  const [conflict, setConflict] = useState(scene.conflict ?? "");
  const [outcome, setOutcome] = useState(scene.outcome ?? "");
  const [sceneCardOpen, setSceneCardOpen] = useState(() =>
    scenePlanningIncomplete(scene.goal ?? "", scene.conflict ?? "", scene.outcome ?? ""),
  );
  const [mentionsPanelOpen, setMentionsPanelOpen] = useState(() => {
    const ids = idsMatchingMentionsInText(
      stripHtml(scene.content ?? "").toLowerCase(),
      characters,
    );
    return ids.length === 0;
  });
  const [wordcount, setWordcount] = useState(scene.wordcount ?? 0);
  const [contentHtml, setContentHtml] = useState(scene.content ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [continuityRefreshKey, setContinuityRefreshKey] = useState(0);
  const [wholeSceneExtractPending, startWholeSceneExtract] = useTransition();
  const [continuityExtractMsg, setContinuityExtractMsg] = useState<string | null>(null);
  const [beatIds, setBeatIds] = useState<string[]>(scene.beat_ids ?? []);
  const sceneParagraphCount = useMemo(
    () => countProseParagraphs(contentHtml),
    [contentHtml],
  );

  const bumpContinuityGutter = useCallback(() => {
    setContinuityRefreshKey((k) => k + 1);
  }, []);

  function runWholeSceneContinuityExtract() {
    if (wholeSceneExtractPending) return;
    if (sceneParagraphCount === 0) {
      setContinuityExtractMsg("Add prose before extracting continuity.");
      return;
    }
    if (
      sceneParagraphCount > WHOLE_SCENE_EXTRACT_PARAGRAPH_WARN &&
      !window.confirm(
        `This scene has ${sceneParagraphCount} paragraphs. Extract continuity for the whole scene? (Uses one AI call.)`,
      )
    ) {
      return;
    }
    setContinuityExtractMsg(null);
    startWholeSceneExtract(async () => {
      const res = await extractContinuityWholeSceneAction(scene.id);
      if (res.ok) {
        const n = res.claimCount ?? 0;
        setContinuityExtractMsg(
          n === 1
            ? "Extracted 1 claim from the whole scene."
            : `Extracted ${n} claims from the whole scene.`,
        );
        bumpContinuityGutter();
      } else {
        setContinuityExtractMsg(res.error ?? "Continuity extraction failed.");
      }
    });
  }

  useEffect(() => {
    if (!continuityExtractMsg) return;
    const t = setTimeout(() => setContinuityExtractMsg(null), 8000);
    return () => clearTimeout(t);
  }, [continuityExtractMsg]);

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
  /** Matches last persisted prose (plain fingerprint); avoids autosave + AI pipeline when TipTap/normalization yields no real change. */
  const lastPersistedFpRef = useRef(prosePlainFingerprint(scene.content ?? ""));

  const povCharacter = characters.find((c) => c.id === scene.pov_character_id);
  const sceneBeats = beats.filter((b) => beatIds.includes(b.id));
  const mentionedCharacterIds = idsMatchingMentionsInText(
    stripHtml(contentHtml ?? "").toLowerCase(),
    characters,
  );
  const mentionsEmpty = mentionedCharacterIds.length === 0;
  /** Full project cast — arc rows are optional notes per scene (not seeded). */
  const trackedCharacters = [...characters].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const selectedRevision = revisions.find((r) => r.id === selectedRevisionId) ?? null;

  const persist = useCallback(
    async (html: string, words: number) => {
      const fp = prosePlainFingerprint(html);
      if (fp === lastPersistedFpRef.current) {
        setSaveState("saved");
        return;
      }
      const clientTs = Date.now();
      setSaveState("saving");
      // Optimistic local write — survives reload + offline.
      try {
        await cacheSceneSnapshot({
          ...(scene as unknown as Record<string, unknown>),
          id: scene.id,
          content: html,
          wordcount: words,
        });
      } catch {
        // local cache failures are non-fatal; continue to server save.
      }
      const offline =
        typeof navigator !== "undefined" && navigator.onLine === false;
      if (offline) {
        try {
          await enqueueSceneSave({
            sceneId: scene.id,
            html,
            wordcount: words,
            fingerprint: fp,
            clientTs,
          });
          lastPersistedFpRef.current = fp;
          setSaveState("saved");
        } catch {
          setSaveState("error");
        }
        return;
      }
      try {
        await saveSceneContent(scene.id, html, words);
        await clearOutboxUpTo(scene.id, clientTs);
        lastPersistedFpRef.current = fp;
        setSaveState("saved");
        setContinuityRefreshKey((k) => k + 1);
      } catch {
        // Server save failed — likely network. Queue locally for resync.
        try {
          await enqueueSceneSave({
            sceneId: scene.id,
            html,
            wordcount: words,
            fingerprint: fp,
            clientTs,
          });
          lastPersistedFpRef.current = fp;
          setSaveState("saved");
        } catch {
          setSaveState("error");
        }
      }
    },
    [scene],
  );

  useEffect(() => {
    lastPersistedFpRef.current = prosePlainFingerprint(scene.content ?? "");
  }, [scene.id, scene.content]);

  useEffect(() => {
    setSceneCardOpen(
      scenePlanningIncomplete(scene.goal ?? "", scene.conflict ?? "", scene.outcome ?? ""),
    );
  }, [scene.id]);

  useEffect(() => {
    setMentionsPanelOpen(mentionsEmpty);
  }, [mentionsEmpty]);

  // Debounced autosave on prose change.
  useEffect(() => {
    if (!dirtyRef.current) return;
    if (prosePlainFingerprint(contentHtml) === lastPersistedFpRef.current) {
      dirtyRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      dirtyRef.current = false;
      startTransition(() => persist(contentHtml, wordcount));
    }, 2500);
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
    const fp = prosePlainFingerprint(html);
    if (fp === lastPersistedFpRef.current) {
      return;
    }
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
        "grid h-full grid-rows-[auto_1fr]",
        focusMode
          ? "md:grid-cols-1 md:grid-rows-1"
          : "md:grid-cols-[1fr_22rem] md:grid-rows-1",
      )}
    >
      <div className="flex min-h-0 flex-col border-b md:border-b-0 md:border-r">
        <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-start md:justify-between md:gap-6 md:py-2">
          <div className="flex min-w-0 flex-col gap-2 text-xs text-muted-foreground md:flex-row md:flex-wrap md:items-center md:gap-x-6 md:gap-y-2">
            {!focusMode && (
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {BackLink ?? (
                  <Link
                    href={`/chapters/${chapter.id}`}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    <ChevronLeft className="h-3 w-3" /> Back to chapter
                  </Link>
                )}
                <span className="hidden text-muted-foreground/80 sm:inline" aria-hidden>
                  ·
                </span>
                <span
                  className="hidden max-w-[min(18rem,70vw)] truncate sm:inline"
                  title={chapter.title ?? undefined}
                >
                  <span className="text-muted-foreground">{chapter.title?.trim() || "Untitled chapter"}</span>
                  <span className="text-muted-foreground/80"> › </span>
                  <span className="font-medium text-foreground">Scene</span>
                </span>
              </div>
            )}
            {(sceneBeats.length > 0 || povCharacter) && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 md:border-l md:border-border md:pl-6">
                {sceneBeats.length > 0 && (
                  <span>
                    Beat:{" "}
                    <span className="text-foreground">
                      {sceneBeats.map((b) => b.title).join(" · ")}
                    </span>
                  </span>
                )}
                {povCharacter && (
                  <span>
                    {sceneBeats.length > 0 && (
                      <span className="text-muted-foreground"> · </span>
                    )}
                    POV:{" "}
                    <span className="text-foreground">{povCharacter.name}</span>
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground md:justify-end">
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
            className="mb-6 h-auto border-0 bg-transparent px-0 font-serif text-2xl font-semibold leading-snug tracking-tight shadow-none focus-visible:ring-0"
          />

          <BeatPicker
            beats={beats}
            beatIds={beatIds}
            setBeatIds={(next) => {
              setBeatIds(next);
              metaDirtyRef.current = true;
            }}
          />

          <details
            key={`scene-card-${scene.id}`}
            className="mb-6 rounded-md border p-3 text-sm"
            open={sceneCardOpen}
            onToggle={(e) => setSceneCardOpen(e.currentTarget.open)}
          >
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

          <SceneBlueprintSection
            sceneId={scene.id}
            initial={parseSceneBlueprint(scene.blueprint)}
          />

          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={wholeSceneExtractPending || sceneParagraphCount === 0}
              onClick={runWholeSceneContinuityExtract}
            >
              {wholeSceneExtractPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Extracting…
                </>
              ) : (
                "Extract continuity (whole scene)"
              )}
            </Button>
            <span className="text-xs text-muted-foreground">
              Or highlight a passage and use Extract continuity in the toolbar.
            </span>
          </div>
          {continuityExtractMsg ? (
            <p className="mb-2 text-sm text-muted-foreground">{continuityExtractMsg}</p>
          ) : null}

          <ProseEditor
            ref={editorRef}
            sceneId={scene.id}
            chapterId={chapter.id}
            enableInlineAssist
            enableContinuityGutter
            enableWikiLinks
            enableFindReplace
            charactersForRename={characters.map((c) => ({
              id: c.id,
              name: c.name,
              aliases: c.aliases ?? [],
            }))}
            worldElementsForRename={(worldElements ?? [])
              .filter((w) => w.name)
              .map((w) => ({
                id: w.id,
                name: w.name as string,
                aliases: w.aliases ?? [],
              }))}
            onRenameEntity={async (entityType, entityId, newName) => {
              await renameEntityFromScene(entityType, entityId, newName);
              router.refresh();
            }}
            continuityDial={continuityDial}
            continuityRefreshKey={continuityRefreshKey}
            onContinuityExtracted={() => bumpContinuityGutter()}
            initialContent={scene.content ?? ""}
            placeholder="Start writing…"
            autofocus
            onChange={onProseChange}
          />

          <details
            key={`mentions-${scene.id}`}
            className="mt-6 rounded-md border p-3 text-sm"
            open={mentionsPanelOpen}
            onToggle={(e) => setMentionsPanelOpen(e.currentTarget.open)}
          >
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
        <>
          <aside className="hidden min-h-0 overflow-y-auto border-l bg-card/60 p-4 backdrop-blur-sm md:block">
            <TeamPanel
              writingProfile={writingProfile}
              sceneId={scene.id}
              chapterId={chapter.id}
              aliases={project.persona_aliases}
              onInsertProse={(text) => {
                editorRef.current?.insertAtCursor(text, { previewInsert: true });
              }}
            />
          </aside>
          <MobileTeamSheet
            writingProfile={writingProfile}
            sceneId={scene.id}
            chapterId={chapter.id}
            aliases={project.persona_aliases}
            onInsertProse={(text) => {
              editorRef.current?.insertAtCursor(text, { previewInsert: true });
            }}
          />
        </>
      )}

      {/* Floating team reopener in focus mode */}
      {focusMode && (
        <FloatingTeamReopener
          writingProfile={writingProfile}
          sceneId={scene.id}
          chapterId={chapter.id}
          aliases={project.persona_aliases}
          onInsertProse={(text) =>
            editorRef.current?.insertAtCursor(text, { previewInsert: true })
          }
        />
      )}
    </div>
  );
}

function MobileTeamSheet({
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
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(
            "fixed inset-x-0 bottom-0 left-0 right-0 top-auto z-50 flex max-h-[min(92vh,720px)] w-full max-w-full translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none rounded-t-2xl border-x-0 border-t bg-background p-0 pb-[max(1rem,env(safe-area-inset-bottom))] pt-0 shadow-xl",
          )}
        >
          <DialogHeader className="border-b px-4 py-3 text-left">
            <DialogTitle className="text-base">Your team</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-2">
            <TeamPanel
              writingProfile={writingProfile}
              sceneId={sceneId}
              chapterId={chapterId}
              aliases={aliases}
              onInsertProse={onInsertProse}
            />
          </div>
        </DialogContent>
      </Dialog>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-lg transition-colors hover:bg-accent hover:text-foreground md:hidden"
        aria-label="Open writing team"
      >
        <Sparkles className="h-5 w-5" />
      </button>
    </>
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

function BeatPicker({
  beats,
  beatIds,
  setBeatIds,
}: {
  beats: Beat[];
  beatIds: string[];
  setBeatIds: (next: string[]) => void;
}) {
  const beatById = new Map(beats.map((b) => [b.id, b]));
  const primaryId = beatIds[0] ?? "";
  const additionalIds = beatIds.slice(1);
  const availableAdditional = beats.filter(
    (b) => b.id !== primaryId && !additionalIds.includes(b.id),
  );
  const summary =
    beatIds.length === 0
      ? "None"
      : beatIds
          .map((id) => beatById.get(id)?.title)
          .filter(Boolean)
          .join(" · ");

  const onPrimaryChange = (id: string) => {
    if (!id) {
      setBeatIds(additionalIds);
      return;
    }
    const filtered = additionalIds.filter((x) => x !== id);
    setBeatIds([id, ...filtered]);
  };

  const addAdditional = (id: string) => {
    if (!id) return;
    setBeatIds([primaryId || id, ...additionalIds, ...(primaryId ? [id] : [])].filter(
      (v, i, arr) => v && arr.indexOf(v) === i,
    ));
  };

  const removeAdditional = (id: string) => {
    setBeatIds([primaryId, ...additionalIds.filter((x) => x !== id)].filter(Boolean));
  };

  return (
    <details className="mb-6 rounded-md border p-3 text-sm">
      <summary className="label-eyebrow flex cursor-pointer select-none items-center justify-between gap-2">
        <span>Story beats</span>
        <span className="truncate text-xs font-normal normal-case tracking-normal text-muted-foreground">
          {summary}
        </span>
      </summary>
      <div className="mt-3 space-y-3">
        <div className="flex items-center gap-2">
          <Label className="w-20 text-xs font-medium">Primary</Label>
          <select
            value={primaryId}
            onChange={(e) => onPrimaryChange(e.target.value)}
            className="h-8 flex-1 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">None</option>
            {beats.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-start gap-2">
          <Label className="w-20 pt-1 text-xs font-medium">Additional</Label>
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            {additionalIds.map((id) => {
              const b = beatById.get(id);
              if (!b) return null;
              return (
                <Chip
                  key={id}
                  active
                  onClick={() => removeAdditional(id)}
                  title="Remove"
                >
                  {b.title} ×
                </Chip>
              );
            })}
            {availableAdditional.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  addAdditional(e.target.value);
                  e.currentTarget.value = "";
                }}
                className="h-7 rounded-md border bg-background px-2 text-xs"
              >
                <option value="">+ Add beat</option>
                {availableAdditional.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            )}
            {additionalIds.length === 0 && availableAdditional.length === 0 && (
              <span className="text-xs text-muted-foreground">None</span>
            )}
          </div>
        </div>
      </div>
    </details>
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
