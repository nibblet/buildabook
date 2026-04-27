"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu as BubbleMenuPrimitive } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useRef,
  useState,
  useTransition,
} from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  runInlineAssist,
  type InlineAssistMode,
} from "@/lib/ai/inline-assist";
import { ContinuityGutter } from "@/components/continuity-gutter";
import type { ContinuityDial } from "@/lib/ai/continuity/dial";
import { WikiLink } from "@/lib/tiptap/wiki-link-node";
import { wikiLinkSuggestion } from "@/lib/tiptap/wiki-link-suggestion";
import { paragraphsFromPlainText } from "@/lib/tiptap/plain-text-paragraphs";

export type ProseEditorHandle = {
  insertAtCursor: (
    text: string,
    opts?: { showUndoBanner?: boolean },
  ) => void;
  replaceSelection: (text: string) => void;
  focus: () => void;
  getText: () => string;
  getHTML: () => string;
  setContent: (html: string) => void;
};

type Props = {
  initialContent?: string | null;
  placeholder?: string;
  onChange?: (html: string, text: string, words: number) => void;
  autofocus?: boolean;
  className?: string;
  /** Phase 1: floating toolbar for selection assists */
  sceneId?: string | null;
  chapterId?: string | null;
  enableInlineAssist?: boolean;
  enableContinuityGutter?: boolean;
  continuityDial?: ContinuityDial;
  continuityRefreshKey?: number;
  enableWikiLinks?: boolean;
};

const INLINE_ACTIONS: { mode: InlineAssistMode; label: string }[] = [
  { mode: "rewrite", label: "Rewrite" },
  { mode: "expand", label: "Expand" },
  { mode: "tighten", label: "Tighten" },
  { mode: "describe", label: "Describe" },
  { mode: "change_pov", label: "Other POV" },
];

export const ProseEditor = forwardRef<ProseEditorHandle, Props>(
  function ProseEditor(
    {
      initialContent,
      placeholder,
      onChange,
      autofocus,
      className,
      sceneId,
      chapterId,
      enableInlineAssist,
      enableContinuityGutter,
      continuityDial,
      continuityRefreshKey,
      enableWikiLinks,
    },
    ref,
  ) {
    const [assistPending, startAssist] = useTransition();
    const [customOpen, setCustomOpen] = useState(false);
    const [customInstruction, setCustomInstruction] = useState("");
    const [customError, setCustomError] = useState<string | null>(null);
    const [customSnippet, setCustomSnippet] = useState("");
    const assistRangeRef = useRef<{
      from: number;
      to: number;
      selectedText: string;
    } | null>(null);
    const undoBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );
    const [undoBannerVisible, setUndoBannerVisible] = useState(false);
    const [assistError, setAssistError] = useState<string | null>(null);

    const dismissUndoBanner = useCallback(() => {
      setUndoBannerVisible(false);
      if (undoBannerTimerRef.current) {
        clearTimeout(undoBannerTimerRef.current);
        undoBannerTimerRef.current = null;
      }
    }, []);

    const showUndoBanner = useCallback(() => {
      setUndoBannerVisible(true);
      if (undoBannerTimerRef.current) {
        clearTimeout(undoBannerTimerRef.current);
      }
      undoBannerTimerRef.current = setTimeout(() => {
        setUndoBannerVisible(false);
        undoBannerTimerRef.current = null;
      }, 8000);
    }, []);

    useEffect(() => {
      return () => {
        if (undoBannerTimerRef.current) {
          clearTimeout(undoBannerTimerRef.current);
        }
      };
    }, []);

    useEffect(() => {
      if (!assistError) return;
      const t = setTimeout(() => setAssistError(null), 8000);
      return () => clearTimeout(t);
    }, [assistError]);

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
          horizontalRule: {},
        }),
        Placeholder.configure({
          placeholder: placeholder || "Start writing…",
        }),
        ...(enableWikiLinks
          ? [WikiLink.configure({ suggestion: wikiLinkSuggestion })]
          : []),
      ],
      content: initialContent || "",
      editorProps: {
        attributes: {
          class: "tiptap prose-writing focus:outline-none min-h-[50vh]",
        },
      },
      immediatelyRender: false,
      onUpdate: ({ editor }) => {
        if (!onChange) return;
        const html = editor.getHTML();
        const text = editor.getText();
        const words = text.trim()
          ? text.trim().split(/\s+/).filter(Boolean).length
          : 0;
        onChange(html, text, words);
      },
    });

    /** One ProseMirror step so a single Cmd/Ctrl+Z restores the previous selection. */
    const replaceRange = useCallback(
      (from: number, to: number, text: string) => {
        if (!editor) return;
        const max = editor.state.doc.content.size;
        if (from < 0 || to > max || from > to) return;
        const nodes = paragraphsFromPlainText(text);
        const chain = editor.chain().focus().deleteRange({ from, to });
        if (nodes.length > 0) chain.insertContent(nodes);
        chain.run();
      },
      [editor],
    );

    const replaceSelection = useCallback(
      (text: string) => {
        if (!editor) return;
        const { from, to } = editor.state.selection;
        replaceRange(from, to, text);
      },
      [editor, replaceRange],
    );

    function captureAssistRange(): boolean {
      if (!editor) return false;
      const { from, to } = editor.state.selection;
      if (from === to) return false;
      const selectedText = editor.state.doc.textBetween(from, to, "\n");
      assistRangeRef.current = { from, to, selectedText };
      return true;
    }

    function runAssist(mode: InlineAssistMode) {
      if (!editor || !sceneId) return;
      setAssistError(null);
      if (!captureAssistRange()) return;
      const { from, to, selectedText } = assistRangeRef.current!;
      startAssist(async () => {
        const res = await runInlineAssist({
          sceneId,
          chapterId: chapterId ?? null,
          selectedText,
          mode,
        });
        if (!res.ok || !res.text) return;
        if (!editor) return;
        const doc = editor.state.doc;
        const max = doc.content.size;
        if (from < 0 || to > max || from > to) {
          setAssistError(
            "That selection is no longer valid. Select the text again.",
          );
          return;
        }
        if (doc.textBetween(from, to, "\n") !== selectedText) {
          setAssistError(
            "The document changed while waiting. Select the passage again.",
          );
          return;
        }
        replaceRange(from, to, res.text);
        showUndoBanner();
      });
    }

    function openCustomAssist() {
      if (!editor || !sceneId) return;
      setCustomError(null);
      if (!captureAssistRange()) return;
      const { selectedText } = assistRangeRef.current!;
      setCustomSnippet(
        selectedText.length > 280
          ? `${selectedText.slice(0, 280)}…`
          : selectedText,
      );
      setCustomInstruction("");
      setCustomOpen(true);
    }

    function applyCustomAssist() {
      if (!editor || !sceneId) return;
      const range = assistRangeRef.current;
      const instruction = customInstruction.trim();
      if (!range || !instruction) return;

      const { from, to, selectedText } = range;
      const doc = editor.state.doc;
      const max = doc.content.size;
      if (from < 0 || to > max || from > to) {
        setCustomError("That selection is no longer valid. Close this dialog and select the text again.");
        return;
      }
      const currentSlice = doc.textBetween(from, to, "\n");
      if (currentSlice !== selectedText) {
        setCustomError("The document changed under that selection. Close this dialog and select the text again.");
        return;
      }

      startAssist(async () => {
        setCustomError(null);
        const res = await runInlineAssist({
          sceneId,
          chapterId: chapterId ?? null,
          selectedText,
          mode: "rewrite",
          authorInstruction: instruction,
        });
        if (!res.ok) {
          setCustomError(res.error || "Assist failed.");
          return;
        }
        if (!res.text) {
          setCustomError("No text returned.");
          return;
        }
        if (!editor) return;
        const docAfter = editor.state.doc;
        const maxAfter = docAfter.content.size;
        if (from < 0 || to > maxAfter || from > to) {
          setCustomError(
            "That selection is no longer valid. Close this dialog and select the text again.",
          );
          return;
        }
        if (docAfter.textBetween(from, to, "\n") !== selectedText) {
          setCustomError(
            "The document changed while waiting. Close this dialog and select the text again.",
          );
          return;
        }
        replaceRange(from, to, res.text);
        showUndoBanner();
        setCustomOpen(false);
        setCustomInstruction("");
        assistRangeRef.current = null;
      });
    }

    useEffect(() => {
      if (autofocus && editor) {
        editor.commands.focus("end");
      }
    }, [autofocus, editor]);

    const handleUndoFromBanner = useCallback(() => {
      if (!editor) return;
      editor.chain().focus().undo().run();
      dismissUndoBanner();
    }, [editor, dismissUndoBanner]);

    useImperativeHandle(
      ref,
      () => ({
        insertAtCursor: (
          text: string,
          opts?: { showUndoBanner?: boolean },
        ) => {
          if (!editor) return;
          insertParagraphs(editor, text);
          if (opts?.showUndoBanner) showUndoBanner();
        },
        replaceSelection,
        focus: () => editor?.commands.focus(),
        getText: () => editor?.getText() || "",
        getHTML: () => editor?.getHTML() || "",
        setContent: (html: string) => editor?.commands.setContent(html),
      }),
      [editor, replaceSelection, showUndoBanner],
    );

    const showBubble =
      !!editor && !!enableInlineAssist && !!sceneId;

    const showContinuity =
      !!editor &&
      !!enableContinuityGutter &&
      !!sceneId;

    return (
      <div className="relative flex w-full min-w-0 gap-0">
        <Dialog
          open={customOpen}
          onOpenChange={(open) => {
            setCustomOpen(open);
            if (!open) {
              setCustomInstruction("");
              setCustomError(null);
              setCustomSnippet("");
              assistRangeRef.current = null;
            }
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Revise selection</DialogTitle>
              <DialogDescription>
                Describe how you want the highlighted passage changed. The Partner
                will rewrite only that selection.
              </DialogDescription>
            </DialogHeader>
            {customSnippet ? (
              <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                <div className="mb-1 font-medium text-foreground">Selected text</div>
                <p className="whitespace-pre-wrap font-serif text-foreground/90">
                  {customSnippet}
                </p>
              </div>
            ) : null}
            <Textarea
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              placeholder='e.g. "Make it steamier" or "Slow the pacing and add interiority"'
              rows={4}
              disabled={assistPending}
            />
            {customError ? (
              <p className="text-sm text-destructive">{customError}</p>
            ) : null}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCustomOpen(false)}
                disabled={assistPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={assistPending || !customInstruction.trim()}
                className="gap-2"
                onClick={() => applyCustomAssist()}
              >
                {assistPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Working…
                  </>
                ) : (
                  "Apply"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {showContinuity ? (
          <ContinuityGutter
            editor={editor}
            sceneId={sceneId}
            dial={continuityDial ?? "helpful"}
            refreshKey={continuityRefreshKey ?? 0}
          />
        ) : null}
        <div className="relative min-w-0 flex-1">
          {undoBannerVisible ? (
            <div
              className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm"
              role="status"
            >
              <span className="text-muted-foreground">Edit applied.</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8"
                  onClick={handleUndoFromBanner}
                >
                  Undo
                </Button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  onClick={dismissUndoBanner}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
          {assistError ? (
            <p className="mb-2 text-sm text-destructive">{assistError}</p>
          ) : null}
          <EditorContent editor={editor} className={cn(className)} />
          {showBubble && editor ? (
            <BubbleMenuPrimitive
              editor={editor}
              shouldShow={({ editor: ed }) =>
                !ed.state.selection.empty &&
                ed.state.selection.from !== ed.state.selection.to
              }
            >
              <div className="flex flex-wrap gap-1 rounded-md border bg-popover p-1 shadow-md">
                {assistPending ? (
                  <span className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Working…
                  </span>
                ) : (
                  <>
                    {INLINE_ACTIONS.map(({ mode, label }) => (
                      <Button
                        key={mode}
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => runAssist(mode)}
                      >
                        {label}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => openCustomAssist()}
                    >
                      Custom…
                    </Button>
                  </>
                )}
              </div>
            </BubbleMenuPrimitive>
          ) : null}
        </div>
      </div>
    );
  },
);

function insertParagraphs(editor: Editor, text: string) {
  const nodes = paragraphsFromPlainText(text);
  if (nodes.length === 0) return;
  editor.chain().focus().insertContent(nodes).run();
}
