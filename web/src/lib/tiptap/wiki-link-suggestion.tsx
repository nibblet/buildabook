"use client";

import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import tippy, { type Instance } from "tippy.js";
import {
  WikiLinkPopup,
  type WikiLinkPopupHandle,
} from "@/components/wiki-link-popup";
import { mentionSearchAction } from "@/app/(app)/scenes/mention-actions";
import type { MentionCandidate } from "@/lib/wiki/mention-search";

type PopupProps = {
  items: MentionCandidate[];
  command: (item: MentionCandidate) => void;
};

export const wikiLinkSuggestion: Omit<
  SuggestionOptions<MentionCandidate>,
  "editor"
> = {
  char: "[[",
  allowSpaces: true,
  items: async ({ query }) => mentionSearchAction(query),
  command: ({ editor, range, props }) => {
    editor
      .chain()
      .focus()
      .insertContentAt(range, [
        {
          type: "wikiLink",
          attrs: {
            targetType: props.targetType,
            targetKey: props.targetKey,
            display: props.display,
          },
        },
        { type: "text", text: " " },
      ])
      .run();
  },
  render: () => {
    let component: ReactRenderer<WikiLinkPopupHandle, PopupProps> | null = null;
    let popup: Instance[] | null = null;
    return {
      onStart: (props) => {
        component = new ReactRenderer(WikiLinkPopup, {
          props: { items: props.items, command: props.command },
          editor: props.editor,
        });
        if (!props.clientRect) return;
        popup = tippy("body", {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
        });
      },
      onUpdate: (props) => {
        component?.updateProps({
          items: props.items,
          command: props.command,
        });
        if (!props.clientRect) return;
        popup?.[0]?.setProps({
          getReferenceClientRect: props.clientRect as () => DOMRect,
        });
      },
      onKeyDown: (props) => component?.ref?.onKeyDown(props.event) ?? false,
      onExit: () => {
        popup?.[0]?.destroy();
        component?.destroy();
      },
    };
  },
};
