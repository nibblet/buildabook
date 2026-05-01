"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { ChevronDown, ChevronUp, X, UserSquare2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findMatches, type FindMatch } from "@/lib/editor/find-matches";
import { findHighlightKey } from "@/lib/editor/find-highlight";
import { paragraphsFromPlainText } from "@/lib/tiptap/plain-text-paragraphs";
import { buildEntityRenameRule } from "@/lib/editor/entity-name-variants";
import { EntityRenameDialog } from "@/components/entity-rename-dialog";
import { cn } from "@/lib/utils";

export type EntityForRename = {
  id: string;
  name: string;
  aliases: string[];
};

type Props = {
  editor: Editor;
  initialMode: "find" | "replace";
  characters: EntityForRename[];
  worldElements: EntityForRename[];
  onClose: () => void;
  onRenameEntity?: (
    entityType: "character" | "world_element",
    entityId: string,
    newName: string,
  ) => Promise<void>;
};

type ReviewMatch = FindMatch & {
  /** Replacement string for this specific match (handles possessives). */
  replacement: string;
  selected: boolean;
};

type RenameContext = {
  entityType: "character" | "world_element";
  entityId: string | null; // null = ad-hoc (not a canonical entity)
  oldName: string;
  newName: string;
  updateEntityRecord: boolean;
};

export function FindReplacePanel({
  editor,
  initialMode,
  characters,
  worldElements,
  onClose,
  onRenameEntity,
}: Props) {
  const [showReplace, setShowReplace] = useState(initialMode === "replace");
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [docVersion, setDocVersion] = useState(0);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  /** When set, panel is in entity-review mode: a list of pre-computed matches with checkboxes. */
  const [reviewState, setReviewState] = useState<{
    context: RenameContext;
    items: ReviewMatch[];
  } | null>(null);

  const queryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    queryInputRef.current?.focus();
    queryInputRef.current?.select();
  }, []);

  // Subscribe to editor doc changes so matches recompute when the prose changes.
  useEffect(() => {
    const update = () => setDocVersion((v) => v + 1);
    editor.on("update", update);
    return () => {
      editor.off("update", update);
    };
  }, [editor]);

  const { matches, regexError } = useMemo(() => {
    if (reviewState) return { matches: [] as FindMatch[], regexError: null as string | null };
    if (!query) return { matches: [], regexError: null };
    if (regex) {
      try {
        new RegExp(query);
      } catch (e) {
        return { matches: [], regexError: e instanceof Error ? e.message : "Invalid regex" };
      }
    }
    const found = findMatches(editor.state.doc, query, {
      caseSensitive,
      wholeWord,
      regex,
    });
    return { matches: found, regexError: null };
    // docVersion is the implicit dependency for editor.state.doc — referencing
    // it here keeps the memo recomputing when the doc updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseSensitive, wholeWord, regex, editor, reviewState, docVersion]);

  const clampedActiveIdx =
    matches.length === 0 ? 0 : Math.min(activeIdx, matches.length - 1);

  // Push decorations whenever the resolved match list / active index changes.
  useEffect(() => {
    if (reviewState) {
      pushHighlights(
        editor,
        reviewState.items.filter((i) => i.selected).map(({ from, to }) => ({ from, to })),
        -1,
      );
    } else {
      pushHighlights(editor, matches, clampedActiveIdx);
    }
  }, [editor, matches, clampedActiveIdx, reviewState]);

  // Clear highlights on unmount.
  useEffect(() => {
    return () => pushHighlights(editor, [], -1);
  }, [editor]);

  const cycleMatch = useCallback(
    (delta: 1 | -1) => {
      if (matches.length === 0) return;
      setActiveIdx((prev) => {
        const next = (prev + delta + matches.length) % matches.length;
        scrollIntoView(editor, matches[next]);
        return next;
      });
    },
    [matches, editor],
  );

  function replaceCurrent() {
    if (matches.length === 0 || !showReplace) return;
    const m = matches[clampedActiveIdx];
    if (!m) return;
    replaceRangeAtomic(editor, m.from, m.to, replacement);
  }

  function replaceAll() {
    if (matches.length === 0 || !showReplace) return;
    const sorted = [...matches].sort((a, b) => b.from - a.from);
    const chain = editor.chain().focus();
    for (const m of sorted) {
      const nodes = paragraphsFromPlainText(replacement);
      chain.deleteRange({ from: m.from, to: m.to });
      if (nodes.length > 0) chain.insertContent(nodes);
    }
    chain.run();
  }

  function applyReview() {
    if (!reviewState) return;
    const selected = reviewState.items.filter((i) => i.selected);
    if (selected.length === 0) {
      finishRename();
      return;
    }
    const sorted = [...selected].sort((a, b) => b.from - a.from);
    const chain = editor.chain().focus();
    for (const m of sorted) {
      const nodes = paragraphsFromPlainText(m.replacement);
      chain.deleteRange({ from: m.from, to: m.to });
      if (nodes.length > 0) chain.insertContent(nodes);
    }
    chain.run();
    finishRename();
  }

  async function finishRename() {
    if (!reviewState) return;
    const ctx = reviewState.context;
    setReviewState(null);
    if (
      ctx.updateEntityRecord &&
      ctx.entityId &&
      onRenameEntity &&
      ctx.newName.trim() &&
      ctx.newName.trim() !== ctx.oldName.trim()
    ) {
      try {
        await onRenameEntity(ctx.entityType, ctx.entityId, ctx.newName.trim());
      } catch (e) {
        console.error("Entity rename failed", e);
      }
    }
  }

  function startEntityReview(ctx: RenameContext) {
    const aliasesForLookup =
      ctx.entityType === "character"
        ? characters.find((c) => c.id === ctx.entityId)?.aliases ?? []
        : worldElements.find((w) => w.id === ctx.entityId)?.aliases ?? [];
    const rule = buildEntityRenameRule({
      canonical: ctx.oldName,
      aliases: aliasesForLookup,
      newName: ctx.newName,
    });
    if (!rule) {
      setRenameDialogOpen(false);
      return;
    }
    // Walk the doc using the rule's regex via findMatches with regex mode.
    const found = findMatches(editor.state.doc, rule.pattern.source, {
      regex: true,
      caseSensitive: false,
    });
    const items: ReviewMatch[] = found.map((m) => ({
      ...m,
      replacement: rule.replace(m.matchText),
      selected: true,
    }));
    setReviewState({ context: ctx, items });
    setRenameDialogOpen(false);
  }

  function toggleReviewItem(idx: number) {
    setReviewState((prev) => {
      if (!prev) return prev;
      const items = prev.items.map((it, i) =>
        i === idx ? { ...it, selected: !it.selected } : it,
      );
      return { ...prev, items };
    });
  }

  function setAllReviewSelected(selected: boolean) {
    setReviewState((prev) => {
      if (!prev) return prev;
      return { ...prev, items: prev.items.map((it) => ({ ...it, selected })) };
    });
  }

  const stats = useMemo(() => {
    if (reviewState) {
      const total = reviewState.items.length;
      const sel = reviewState.items.filter((i) => i.selected).length;
      return `${sel} of ${total} selected`;
    }
    if (regexError) return regexError;
    if (!query) return "";
    if (matches.length === 0) return "No matches";
    return `${clampedActiveIdx + 1} of ${matches.length}`;
  }, [reviewState, regexError, query, matches, clampedActiveIdx]);

  return (
    <>
      <div
        className="absolute right-2 top-2 z-20 w-[22rem] rounded-md border bg-popover p-3 text-sm shadow-lg"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      >
        {reviewState ? (
          <ReviewView
            context={reviewState.context}
            items={reviewState.items}
            stats={stats}
            onToggle={toggleReviewItem}
            onSetAll={setAllReviewSelected}
            onApply={applyReview}
            onCancel={() => setReviewState(null)}
            onClose={onClose}
          />
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2">
              <Input
                ref={queryInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    cycleMatch(e.shiftKey ? -1 : 1);
                  }
                }}
                placeholder="Find"
                className="h-8 flex-1"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                disabled={matches.length === 0}
                onClick={() => cycleMatch(-1)}
                title="Previous (Shift+Enter)"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                disabled={matches.length === 0}
                onClick={() => cycleMatch(1)}
                title="Next (Enter)"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={onClose}
                title="Close (Esc)"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {showReplace ? (
              <div className="mb-2 flex items-center gap-2">
                <Input
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                  placeholder="Replace with"
                  className="h-8 flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={matches.length === 0}
                  onClick={replaceCurrent}
                >
                  Replace
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  disabled={matches.length === 0}
                  onClick={replaceAll}
                >
                  All
                </Button>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <ToggleChip active={caseSensitive} onClick={() => setCaseSensitive((v) => !v)}>
                Aa
              </ToggleChip>
              <ToggleChip active={wholeWord} onClick={() => setWholeWord((v) => !v)}>
                W
              </ToggleChip>
              <ToggleChip active={regex} onClick={() => setRegex((v) => !v)}>
                .*
              </ToggleChip>
              <button
                type="button"
                className="ml-auto underline-offset-2 hover:underline"
                onClick={() => setShowReplace((v) => !v)}
              >
                {showReplace ? "Hide replace" : "Show replace"}
              </button>
              {(characters.length > 0 || worldElements.length > 0) && onRenameEntity ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                  onClick={() => setRenameDialogOpen(true)}
                  title="Rename a character or location"
                >
                  <UserSquare2 className="h-3 w-3" /> Rename entity…
                </button>
              ) : null}
            </div>

            <p className={cn(
              "mt-2 text-xs",
              regexError ? "text-destructive" : "text-muted-foreground",
            )}>
              {stats || " "}
            </p>
          </>
        )}
      </div>

      <EntityRenameDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        characters={characters}
        worldElements={worldElements}
        onConfirm={startEntityReview}
        canUpdateEntityRecord={!!onRenameEntity}
      />
    </>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-6 items-center rounded border px-2 text-[11px] font-medium",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ReviewView({
  context,
  items,
  stats,
  onToggle,
  onSetAll,
  onApply,
  onCancel,
  onClose,
}: {
  context: RenameContext;
  items: ReviewMatch[];
  stats: string;
  onToggle: (idx: number) => void;
  onSetAll: (selected: boolean) => void;
  onApply: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const allSelected = items.every((i) => i.selected);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-foreground">
          Rename <strong>{context.oldName}</strong> →{" "}
          <strong>{context.newName}</strong>
        </p>
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{stats}</span>
        <button
          type="button"
          className="underline-offset-2 hover:underline"
          onClick={() => onSetAll(!allSelected)}
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto rounded border">
        {items.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">No matches found.</p>
        ) : (
          items.map((it, idx) => (
            <label
              key={`${it.from}-${it.to}`}
              className="flex cursor-pointer items-start gap-2 border-b px-2 py-1.5 text-xs last:border-b-0 hover:bg-accent"
            >
              <input
                type="checkbox"
                checked={it.selected}
                onChange={() => onToggle(idx)}
                className="mt-0.5"
              />
              <span className="leading-snug">
                <span className="text-muted-foreground">…{it.contextBefore}</span>
                <span className="bg-yellow-200 font-semibold text-foreground dark:bg-yellow-700/60">
                  {it.matchText}
                </span>
                <span className="text-muted-foreground">{it.contextAfter}…</span>
                <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  → {it.replacement}
                </span>
              </span>
            </label>
          ))
        )}
      </div>
      {context.updateEntityRecord && context.entityId ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          The entity record will be renamed and the old name pushed into aliases.
          That database change is not undone by Cmd/Ctrl+Z.
        </p>
      ) : null}
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={items.every((i) => !i.selected)}
          onClick={onApply}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}

function pushHighlights(
  editor: Editor,
  ranges: { from: number; to: number }[],
  activeIndex: number,
) {
  const tr = editor.state.tr.setMeta(findHighlightKey, {
    ranges: ranges.map(({ from, to }) => ({ from, to })),
    activeIndex,
  });
  editor.view.dispatch(tr);
}

function scrollIntoView(editor: Editor, match: { from: number; to: number }) {
  if (!match) return;
  editor.commands.setTextSelection({ from: match.from, to: match.to });
  editor.commands.scrollIntoView();
}

function replaceRangeAtomic(
  editor: Editor,
  from: number,
  to: number,
  text: string,
) {
  const max = editor.state.doc.content.size;
  if (from < 0 || to > max || from > to) return;
  const nodes = paragraphsFromPlainText(text);
  const chain = editor.chain().focus().deleteRange({ from, to });
  if (nodes.length > 0) chain.insertContent(nodes);
  chain.run();
}
