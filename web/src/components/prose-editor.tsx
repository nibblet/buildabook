"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu as BubbleMenuPrimitive } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  useEffect,
  useImperativeHandle,
  forwardRef,
  useTransition,
} from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  runInlineAssist,
  type InlineAssistMode,
} from "@/lib/ai/inline-assist";
import { ContinuityGutter } from "@/components/continuity-gutter";
import type { ContinuityDial } from "@/lib/ai/continuity/dial";
import { WikiLink } from "@/lib/tiptap/wiki-link-node";
import { wikiLinkSuggestion } from "@/lib/tiptap/wiki-link-suggestion";

export type ProseEditorHandle = {
  insertAtCursor: (text: string) => void;
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

    function replaceSelection(text: string) {
      if (!editor) return;
      const { from, to } = editor.state.selection;
      editor.chain().focus().deleteRange({ from, to }).run();
      insertParagraphs(editor, text);
    }

    function runAssist(mode: InlineAssistMode) {
      if (!editor || !sceneId) return;
      const { from, to } = editor.state.selection;
      if (from === to) return;
      const selectedText = editor.state.doc.textBetween(from, to, "\n");
      startAssist(async () => {
        const res = await runInlineAssist({
          sceneId,
          chapterId: chapterId ?? null,
          selectedText,
          mode,
        });
        if (!res.ok || !res.text) return;
        replaceSelection(res.text);
      });
    }

    useEffect(() => {
      if (autofocus && editor) {
        editor.commands.focus("end");
      }
    }, [autofocus, editor]);

    useImperativeHandle(
      ref,
      () => ({
        insertAtCursor: (text: string) => {
          if (!editor) return;
          insertParagraphs(editor, text);
        },
        replaceSelection: (text: string) => replaceSelection(text),
        focus: () => editor?.commands.focus(),
        getText: () => editor?.getText() || "",
        getHTML: () => editor?.getHTML() || "",
        setContent: (html: string) => editor?.commands.setContent(html),
      }),
      [editor],
    );

    const showBubble =
      !!editor && !!enableInlineAssist && !!sceneId;

    const showContinuity =
      !!editor &&
      !!enableContinuityGutter &&
      !!sceneId;

    return (
      <div className="relative flex w-full min-w-0 gap-0">
        {showContinuity ? (
          <ContinuityGutter
            editor={editor}
            sceneId={sceneId}
            dial={continuityDial ?? "helpful"}
            refreshKey={continuityRefreshKey ?? 0}
          />
        ) : null}
        <div className="relative min-w-0 flex-1">
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
                  INLINE_ACTIONS.map(({ mode, label }) => (
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
                  ))
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
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chain = editor.chain().focus();
  for (const p of paragraphs) {
    chain.insertContent({
      type: "paragraph",
      content: [{ type: "text", text: p }],
    });
  }
  chain.run();
}
