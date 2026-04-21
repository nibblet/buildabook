"use client";

import { forwardRef, useImperativeHandle, useState, useEffect } from "react";
import type { MentionCandidate } from "@/lib/wiki/mention-search";

type Props = {
  items: MentionCandidate[];
  command: (item: MentionCandidate) => void;
};

export type WikiLinkPopupHandle = {
  onKeyDown: (event: KeyboardEvent) => boolean;
};

export const WikiLinkPopup = forwardRef<WikiLinkPopupHandle, Props>(
  function WikiLinkPopup({ items, command }, ref) {
    const [index, setIndex] = useState(0);
    useEffect(() => setIndex(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: (event) => {
        if (event.key === "ArrowUp") {
          setIndex((i) => (i + items.length - 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === "ArrowDown") {
          setIndex((i) => (i + 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === "Enter") {
          const item = items[index];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="min-w-[240px] rounded-md border bg-popover p-2 text-xs text-muted-foreground shadow-md">
          No matching characters, world elements, or wiki docs.
        </div>
      );
    }

    return (
      <div className="min-w-[240px] overflow-hidden rounded-md border bg-popover p-1 text-sm shadow-md">
        {items.map((item, i) => (
          <button
            key={`${item.targetType}:${item.targetKey}`}
            type="button"
            onClick={() => command(item)}
            className={`flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left ${
              i === index ? "bg-accent text-accent-foreground" : ""
            }`}
          >
            <span>{item.display}</span>
            <span className="text-xs text-muted-foreground">
              {item.targetType}
            </span>
          </button>
        ))}
      </div>
    );
  },
);
