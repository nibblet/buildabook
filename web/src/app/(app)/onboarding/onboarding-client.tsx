"use client";

import { useState, useTransition } from "react";
import { Sparkles, ArrowRight, Check, X, AlertCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  type WritingProfileId,
  projectTagFieldLabel,
} from "@/lib/deployment/writing-profile";
import type { TropeOption } from "@/lib/seed/beats";
import { cn } from "@/lib/utils";
import type { ExtractedDraftT } from "@/lib/ai/extract";
import { runExtraction, commitOnboarding } from "./actions";

type Step = "paste" | "extracting" | "review" | "saving";

type ApprovedState = {
  characters: boolean[];
  worldElements: boolean[];
  openThreads: boolean[];
};

export function OnboardingClient({
  writingProfile,
  tropeOptions,
  defaultTargetWordcount,
  defaultHeatLevel,
}: {
  writingProfile: WritingProfileId;
  tropeOptions: TropeOption[];
  defaultTargetWordcount: number;
  defaultHeatLevel: string;
}) {
  const [step, setStep] = useState<Step>("paste");
  const [draft, setDraft] = useState("");
  const [extracted, setExtracted] = useState<ExtractedDraftT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [premise, setPremise] = useState("");
  const [styleNotes, setStyleNotes] = useState("");
  const [paranormalType, setParanormalType] = useState("");
  const [heatLevel, setHeatLevel] = useState(defaultHeatLevel);
  const [targetWordcount, setTargetWordcount] = useState(defaultTargetWordcount);
  const [chapterTitle, setChapterTitle] = useState("");
  const [tropes, setTropes] = useState<string[]>([]);
  const [approved, setApproved] = useState<ApprovedState>({
    characters: [],
    worldElements: [],
    openThreads: [],
  });

  async function onExtract() {
    setError(null);
    if (!draft.trim() || draft.trim().length < 200) {
      setError("Paste at least a few paragraphs so the team has enough to read.");
      return;
    }
    setStep("extracting");
    const result = await runExtraction(draft);
    if (!result.ok || !result.data) {
      setError(result.error || "Extraction failed.");
      setStep("paste");
      return;
    }
    const d = result.data;
    setExtracted(d);
    setTitle("Untitled Novella");
    setPremise(d.premise || "");
    setStyleNotes(d.style_notes || "");
    setParanormalType(d.paranormal_type || "");
    setChapterTitle(d.chapter_title || "Chapter 1");
    setApproved({
      characters: d.characters.map(() => true),
      worldElements: d.world_elements.map(() => true),
      openThreads: d.open_threads.map(() => true),
    });
    setStep("review");
  }

  function toggleApproval(key: keyof ApprovedState, idx: number) {
    setApproved((prev) => {
      const next = { ...prev };
      const arr = [...next[key]];
      arr[idx] = !arr[idx];
      next[key] = arr;
      return next;
    });
  }

  function toggleTrope(id: string) {
    setTropes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function onApproveAndSave() {
    if (!extracted) return;
    setStep("saving");
    startTransition(async () => {
      try {
        const payload = {
          title,
          premise,
          styleNotes,
          paranormalType,
          heatLevel,
          targetWordcount,
          tropes,
          characters: extracted.characters
            .filter((_, i) => approved.characters[i])
            .map((c) => ({
              name: c.name,
              role: c.role ?? null,
              species: c.species ?? null,
              archetype: c.archetype ?? null,
              voice_notes: c.voice_notes ?? null,
              powers: c.powers ?? null,
              backstory: c.backstory ?? null,
              aliases: c.aliases ?? [],
            })),
          worldElements: extracted.world_elements
            .filter((_, i) => approved.worldElements[i])
            .map((w) => ({
              category: w.category,
              name: w.name,
              description: w.description,
            })),
          scenes: extracted.scenes.map((s, idx) => ({
            order_index: s.order_index ?? idx,
            pov_character_name: s.pov_character_name ?? null,
            goal: s.goal ?? null,
            conflict: s.conflict ?? null,
            outcome: s.outcome ?? null,
            content: s.content,
            beats_covered: s.beats_covered ?? [],
          })),
          beatsCovered: extracted.beats_covered ?? [],
          openThreads: extracted.open_threads.filter(
            (_, i) => approved.openThreads[i],
          ),
          styleSample: extracted.style_sample ?? null,
          chapterTitle,
        };
        await commitOnboarding(payload);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Save failed. Try again.",
        );
        setStep("review");
      }
    });
  }

  if (step === "paste" || step === "extracting") {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Welcome
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight">
            Let&apos;s set up your book
          </h1>
          <p className="mt-2 max-w-prose text-muted-foreground">
            Paste <strong>chapter 1</strong> (or one chapter at a time). The
            team pulls out characters, world facts, and a <strong>small set of
            scenes</strong> — big breaks like <code className="rounded bg-muted px-1">---</code>{" "}
            or major shifts, not every paragraph. If you paste many chapters at
            once, you&apos;ll get one long chapter with lots of scenes; use
            Settings later to tidy up, or re-onboard with a shorter paste.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <Label htmlFor="draft" className="text-sm">
                Your draft
              </Label>
              <Textarea
                id="draft"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="mt-2 min-h-[320px] font-serif text-base leading-relaxed"
                placeholder="Paste one chapter here. Optional scene breaks: --- on its own line."
                disabled={step === "extracting"}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {draft ? `${draft.trim().split(/\s+/).filter(Boolean).length} words` : "No draft yet"}
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Extraction takes about 20–40 seconds.
              </p>
              <Button
                onClick={onExtract}
                disabled={step === "extracting" || !draft.trim()}
                className="gap-2"
              >
                {step === "extracting" ? (
                  <>
                    <Sparkles className="h-4 w-4 animate-pulse" /> Reading your
                    draft…
                  </>
                ) : (
                  <>
                    Read my draft <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <SkipLink />
      </div>
    );
  }

  if (!extracted) return null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Review
        </p>
        <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight">
          Here&apos;s what the team found
        </h1>
        <p className="mt-2 text-muted-foreground">
          Uncheck anything that&apos;s wrong. Edit the project details on the
          left. When you&apos;re happy, save and start writing.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Project
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FieldInput label="Book title" value={title} onChange={setTitle} />
            <FieldInput
              label="Chapter 1 title"
              value={chapterTitle}
              onChange={setChapterTitle}
            />
            <FieldArea
              label="Premise"
              value={premise}
              onChange={setPremise}
              placeholder="A 1–3 sentence pitch."
            />
            <FieldArea
              label="Voice notes"
              value={styleNotes}
              onChange={setStyleNotes}
              placeholder="How your prose sounds — rhythm, POV, habits."
            />
            <div
              className={
                writingProfile === "sci_fi"
                  ? "grid gap-3"
                  : "grid grid-cols-2 gap-3"
              }
            >
              <FieldInput
                label={projectTagFieldLabel(writingProfile)}
                value={paranormalType}
                onChange={setParanormalType}
              />
              {writingProfile !== "sci_fi" ? (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Heat level
                  </Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={heatLevel}
                    onChange={(e) => setHeatLevel(e.target.value)}
                  >
                    <option value="sweet">Sweet</option>
                    <option value="sensual">Sensual</option>
                    <option value="steamy">Steamy</option>
                    <option value="explicit">Explicit</option>
                  </select>
                </div>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Target wordcount
              </Label>
              <Input
                type="number"
                value={targetWordcount}
                onChange={(e) => setTargetWordcount(Number(e.target.value))}
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">
                Tropes (pick any that fit)
              </Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {tropeOptions.map((t) => {
                  const on = tropes.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTrope(t.id)}
                      title={t.explainer}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background hover:bg-accent",
                      )}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              What the team found in your draft
            </CardTitle>
            <CardDescription>
              {extracted.scenes.length} scene
              {extracted.scenes.length === 1 ? "" : "s"} ·{" "}
              {extracted.characters.length} character
              {extracted.characters.length === 1 ? "" : "s"} ·{" "}
              {extracted.world_elements.length} world fact
              {extracted.world_elements.length === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="chars">
              <TabsList className="w-full">
                <TabsTrigger value="chars" className="flex-1">
                  Characters
                </TabsTrigger>
                <TabsTrigger value="world" className="flex-1">
                  World
                </TabsTrigger>
                <TabsTrigger value="scenes" className="flex-1">
                  Scenes
                </TabsTrigger>
                <TabsTrigger value="threads" className="flex-1">
                  Threads
                </TabsTrigger>
              </TabsList>

              <TabsContent value="chars" className="space-y-2">
                {extracted.characters.map((c, i) => (
                  <ReviewRow
                    key={i}
                    approved={approved.characters[i]}
                    onToggle={() => toggleApproval("characters", i)}
                  >
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[c.role, c.species, c.archetype].filter(Boolean).join(" · ")}
                    </div>
                    {c.voice_notes && (
                      <div className="mt-1 text-xs italic text-muted-foreground">
                        Voice: {c.voice_notes}
                      </div>
                    )}
                  </ReviewRow>
                ))}
                {extracted.characters.length === 0 && <Empty />}
              </TabsContent>

              <TabsContent value="world" className="space-y-2">
                {extracted.world_elements.map((w, i) => (
                  <ReviewRow
                    key={i}
                    approved={approved.worldElements[i]}
                    onToggle={() => toggleApproval("worldElements", i)}
                  >
                    <div className="flex items-baseline gap-2">
                      <Badge variant="muted" className="uppercase">
                        {w.category}
                      </Badge>
                      <span className="text-sm font-medium">{w.name}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {w.description}
                    </div>
                  </ReviewRow>
                ))}
                {extracted.world_elements.length === 0 && <Empty />}
              </TabsContent>

              <TabsContent value="scenes" className="space-y-2">
                {extracted.scenes.map((s, i) => (
                  <div
                    key={i}
                    className="rounded-md border bg-background p-3 text-sm"
                  >
                    <div className="flex items-baseline justify-between">
                      <div className="font-medium">
                        Scene {s.order_index + 1}
                        {s.pov_character_name && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            · POV: {s.pov_character_name}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.content.trim().split(/\s+/).filter(Boolean).length}{" "}
                        words
                      </div>
                    </div>
                    {(s.goal || s.conflict || s.outcome) && (
                      <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground">
                        {s.goal && <div><span className="font-medium">Goal:</span> {s.goal}</div>}
                        {s.conflict && <div><span className="font-medium">Conflict:</span> {s.conflict}</div>}
                        {s.outcome && <div><span className="font-medium">Outcome:</span> {s.outcome}</div>}
                      </dl>
                    )}
                    {s.beats_covered && s.beats_covered.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {s.beats_covered.map((b) => (
                          <Badge key={b} variant="secondary">{b}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {extracted.scenes.length === 0 && <Empty />}
              </TabsContent>

              <TabsContent value="threads" className="space-y-2">
                {extracted.open_threads.map((t, i) => (
                  <ReviewRow
                    key={i}
                    approved={approved.openThreads[i]}
                    onToggle={() => toggleApproval("openThreads", i)}
                  >
                    <div className="text-sm">{t.question}</div>
                  </ReviewRow>
                ))}
                {extracted.open_threads.length === 0 && <Empty />}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between border-t pt-4">
        <Button
          variant="ghost"
          onClick={() => {
            setStep("paste");
            setExtracted(null);
          }}
          disabled={isPending}
        >
          Back
        </Button>
        <Button
          onClick={onApproveAndSave}
          disabled={isPending}
          className="gap-2"
        >
          {isPending ? "Saving…" : "Save and start writing"}{" "}
          {!isPending && <ArrowRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function FieldArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
      />
    </div>
  );
}

function ReviewRow({
  approved,
  onToggle,
  children,
}: {
  approved: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border bg-background p-3 transition-opacity",
        !approved && "opacity-50",
      )}
    >
      <button
        onClick={onToggle}
        type="button"
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-foreground transition-colors",
          approved
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input bg-background",
        )}
        aria-label={approved ? "Approved — click to discard" : "Discarded — click to approve"}
      >
        {approved ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      </button>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Empty() {
  return (
    <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
      Nothing here.
    </p>
  );
}

function SkipLink() {
  return (
    <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
      Don&apos;t have a draft yet?{" "}
      <a href="#" className="underline">
        Skip — start from a blank page.
      </a>{" "}
      <span className="opacity-70">(Phase 1)</span>
    </div>
  );
}
