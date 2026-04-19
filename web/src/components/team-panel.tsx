"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Sparkles,
  MessageCircle,
  Loader2,
  Copy,
  Check,
  BookOpen,
  PenLine,
  List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Chip } from "@/components/ui/chip";
import { type CorePersonaKey, getPersonas } from "@/lib/ai/personas";
import { askPersona } from "@/lib/ai/ask";
import type { WritingProfileId } from "@/lib/deployment/writing-profile";

const ALL_PERSONA_KEYS: CorePersonaKey[] = [
  "partner",
  "profiler",
  "specialist",
  "proofreader",
  "analyst",
];

const ICONS: Record<CorePersonaKey, typeof Sparkles> = {
  partner: Sparkles,
  profiler: MessageCircle,
  specialist: BookOpen,
  proofreader: PenLine,
  analyst: List,
};

type ProofreaderResult = { cleaned: string; changes: string[] };

function tryParseProofreader(text: string): ProofreaderResult | null {
  const t = text.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end < start) return null;
  try {
    const o = JSON.parse(t.slice(start, end + 1)) as {
      cleaned?: string;
      changes?: string[];
    };
    if (typeof o.cleaned === "string")
      return { cleaned: o.cleaned, changes: o.changes ?? [] };
  } catch {
    return null;
  }
  return null;
}

export function TeamPanel({
  writingProfile,
  sceneId,
  chapterId,
  beatId,
  aliases,
  onInsertProse,
  quickPrompts,
}: {
  writingProfile: WritingProfileId;
  sceneId?: string | null;
  chapterId?: string | null;
  beatId?: string | null;
  aliases?: Record<string, string> | null;
  onInsertProse?: (text: string) => void;
  quickPrompts?: Record<string, string[]>;
}) {
  const personas = useMemo(() => getPersonas(writingProfile), [writingProfile]);

  const [activeKey, setActiveKey] = useState<CorePersonaKey>("partner");
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [proofParts, setProofParts] = useState<ProofreaderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const active = personas[activeKey];
  const label = aliases?.[activeKey] || active.label;
  const ActiveIcon = ICONS[activeKey];

  function onSend(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setResponse("");
    setProofParts(null);
    const text = prompt.trim();
    if (!text) return;
    startTransition(async () => {
      const result = await askPersona({
        personaKey: activeKey,
        userPrompt: text,
        sceneId: sceneId ?? null,
        chapterId: chapterId ?? null,
        beatId: beatId ?? null,
      });
      if (!result.ok) {
        setError(result.error || "Request failed.");
        return;
      }
      const raw = result.text || "";
      if (activeKey === "proofreader") {
        const parsed = tryParseProofreader(raw);
        if (parsed) {
          setProofParts(parsed);
          setResponse(parsed.cleaned);
          return;
        }
      }
      setResponse(raw);
    });
  }

  async function copyResponse() {
    const txt = proofParts?.cleaned ?? response;
    if (!txt) return;
    await navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  const quicks =
    quickPrompts?.[activeKey] ??
    defaultQuickPrompts(writingProfile, activeKey);

  const showInsertPartner =
    activeKey === "partner" && onInsertProse && response && !proofParts;
  const showInsertProof =
    proofParts && onInsertProse && activeKey === "proofreader";

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <div className="label-eyebrow mb-2">Your team</div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_PERSONA_KEYS.map((k) => {
            const p = personas[k];
            const alias = aliases?.[k] || p.label;
            const Ico = ICONS[k];
            return (
              <Chip
                key={k}
                active={activeKey === k}
                title={p.tagline}
                onClick={() => {
                  setActiveKey(k);
                  setResponse("");
                  setProofParts(null);
                  setError(null);
                }}
              >
                <Ico className="h-3 w-3 opacity-90" />
                <span className="max-[380px]:hidden">{alias}</span>
              </Chip>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{active.tagline}</p>
      </div>

      <div className="space-y-1.5">
        <div className="label-eyebrow">Try</div>
        <div className="flex flex-wrap gap-1">
          {quicks.map((q) => (
            <Chip key={q} onClick={() => setPrompt(q)}>
              {q}
            </Chip>
          ))}
        </div>
      </div>

      <form onSubmit={onSend} className="space-y-2">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            activeKey === "partner"
              ? "What should I write next?"
              : activeKey === "analyst"
                ? "Ask for names, variations, one-line options…"
                : "What do you want help with?"
          }
          rows={3}
        />
        <div className="flex items-center justify-end gap-2">
          <Button
            type="submit"
            size="sm"
            disabled={isPending || !prompt.trim()}
            className="gap-2"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
              </>
            ) : activeKey === "partner" ? (
              <>
                <Sparkles className="h-4 w-4" /> Draft
              </>
            ) : activeKey === "proofreader" ? (
              <>
                <PenLine className="h-4 w-4" /> Polish
              </>
            ) : activeKey === "analyst" ? (
              <>
                <List className="h-4 w-4" /> Answer
              </>
            ) : (
              <>
                <ActiveIcon className="h-4 w-4" /> Ask
              </>
            )}
          </Button>
        </div>
      </form>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      {(response || proofParts) && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-1 flex items-center justify-between">
            <div className="label-eyebrow">{label}</div>
            <div className="flex gap-1">
              {showInsertPartner && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onInsertProse(response)}
                >
                  Insert at cursor
                </Button>
              )}
              {showInsertProof && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onInsertProse(proofParts.cleaned)}
                >
                  Replace selection with cleaned text
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={copyResponse}
                className="gap-1"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" /> Copy
                  </>
                )}
              </Button>
            </div>
          </div>

          {proofParts && proofParts.changes.length > 0 && (
            <div className="mb-2 rounded-md border bg-muted/40 p-2 text-xs">
              <div className="font-medium text-muted-foreground">Changes</div>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {proofParts.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-sm leading-relaxed",
              activeKey === "partner" && "font-serif text-[15px]",
            )}
          >
            {proofParts?.cleaned ?? response}
          </div>
        </div>
      )}
    </div>
  );
}

function defaultQuickPrompts(
  writingProfile: WritingProfileId,
  key: CorePersonaKey,
): string[] {
  switch (key) {
    case "partner":
      return writingProfile === "erotic_mature"
        ? [
            "Continue the scene",
            "More interiority before the next touch",
            "Same moment, the other lead's POV",
            "Dial up tension without rushing payoff",
          ]
        : [
            "Continue the scene",
            "Open with a sensory detail",
            "Write from his POV",
            "Show what she notices",
          ];
    case "profiler":
      return writingProfile === "erotic_mature"
        ? [
            "What's working emotionally here?",
            "Is desire and consent both legible?",
            "Does the POV stay embodied?",
            "What would make the next beat cost more?",
          ]
        : [
            "What's working here?",
            "Is the tension landing?",
            "Does the POV hold?",
            "What is this scene really about?",
          ];
    case "specialist":
      if (writingProfile === "erotic_mature")
        return [
          "Is this beat hitting for erotic romance readers?",
          "What would readers expect next?",
          "Heat level vs emotional beat — thoughts?",
        ];
      if (writingProfile === "sci_fi")
        return [
          "Does this world rule support the scene’s stakes?",
          "What would genre readers expect next from this subgenre?",
          "Speculative vs. character — is the balance working?",
        ];
      return [
        "Is this beat normal for PNR?",
        "What would readers expect next?",
        "Heat level vs tone — thoughts?",
      ];
    case "proofreader":
      return ["Proofread my last paragraph", "Check tense consistency"];
    case "analyst":
      if (writingProfile === "sci_fi")
        return [
          "5 surnames for this character",
          "Alternate title options with a science angle",
          "3 ways this world rule could complicate the next scene",
        ];
      if (writingProfile === "erotic_mature")
        return [
          "5 first names that fit this heat + tone",
          "Alternate titles with emotional hook",
          "3 ways this scene could pivot on a boundary or choice",
        ];
      return [
        "5 surname options for her",
        "Alternate chapter titles",
        "3 ways this beat could twist",
      ];
    default:
      return [];
  }
}
