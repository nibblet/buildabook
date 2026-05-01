import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type HighlightRange = { from: number; to: number };

export type FindHighlightMeta = {
  ranges: HighlightRange[];
  activeIndex: number;
};

export const findHighlightKey = new PluginKey<DecorationSet>("findHighlight");

export const FindHighlight = Extension.create({
  name: "findHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: findHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(findHighlightKey) as
              | FindHighlightMeta
              | undefined;
            if (meta) {
              const decos = meta.ranges
                .filter((r) => r.from < r.to)
                .map((r, i) =>
                  Decoration.inline(r.from, r.to, {
                    class:
                      i === meta.activeIndex
                        ? "find-match find-match-active"
                        : "find-match",
                  }),
                );
              return DecorationSet.create(tr.doc, decos);
            }
            if (tr.docChanged) {
              return old.map(tr.mapping, tr.doc);
            }
            return old;
          },
        },
        props: {
          decorations(state) {
            return findHighlightKey.getState(state);
          },
        },
      }),
    ];
  },
});
