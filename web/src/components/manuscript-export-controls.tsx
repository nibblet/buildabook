"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { slugifyForFilename } from "@/lib/export/filename";
import { chapterHeadingLabel } from "@/lib/manuscript-labels";
import type { Chapter } from "@/lib/supabase/types";

export function ManuscriptExportControls({
  projectTitle,
  activeChapter,
  singleChapterMode,
}: {
  projectTitle: string;
  activeChapter: Pick<Chapter, "id" | "title" | "order_index"> | null;
  singleChapterMode: boolean;
}) {
  const fullDocxHref = "/api/manuscript/export?format=docx";
  const chapterDocxHref =
    activeChapter &&
    `/api/manuscript/export?format=docx&chapter=${encodeURIComponent(activeChapter.id)}`;

  const handlePrint = () => {
    const prevTitle = document.title;
    const printLabel =
      singleChapterMode && activeChapter
        ? `${projectTitle} — ${chapterHeadingLabel(activeChapter)}`
        : projectTitle;
    document.title = slugifyForFilename(printLabel.replace(/—/g, "-"));

    const restore = () => {
      document.title = prevTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  /** Let Radix close the dropdown (don’t call preventDefault on the item). Wait a tick so portaled menu unmounts before print. */
  const queuePrintAfterMenuClose = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        handlePrint();
      });
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <a href={fullDocxHref}>Word (.docx) — Full book</a>
        </DropdownMenuItem>
        {chapterDocxHref ? (
          <DropdownMenuItem asChild>
            <a href={chapterDocxHref}>Word (.docx) — This chapter</a>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2" onSelect={queuePrintAfterMenuClose}>
          <Printer className="h-4 w-4 shrink-0 opacity-70" />
          Print / Save as PDF…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
