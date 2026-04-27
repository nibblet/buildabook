"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: "replace" | "insert";
  /** Shown in header / for screen readers */
  assistLabel?: string;
  previousText: string;
  proposedText: string;
  onAccept: () => void;
  onReject: () => void;
  /** True while applying replace/insert to the editor */
  applying?: boolean;
};

export function AiEditReviewDialog({
  open,
  onOpenChange,
  variant,
  assistLabel,
  previousText,
  proposedText,
  onAccept,
  onReject,
  applying,
}: Props) {
  const title =
    variant === "insert"
      ? "Review insert"
      : assistLabel
        ? `Review: ${assistLabel}`
        : "Review changes";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {variant === "insert"
              ? "New text will be inserted at the cursor. Compare with what you asked for, then accept or discard."
              : "Compare the previous selection with the AI revision, then accept or discard."}
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "grid min-h-0 flex-1 gap-0 border-b md:grid-cols-2",
            "divide-y md:divide-x md:divide-y-0",
          )}
        >
          <div className="flex min-h-0 flex-col bg-muted/20 md:max-h-[min(55vh,420px)]">
            <div className="shrink-0 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
              {variant === "insert" ? "Current document" : "Previous"}
            </div>
            <ScrollArea className="min-h-[140px] flex-1 md:max-h-[min(55vh,420px)]">
              <div className="p-4">
                {variant === "insert" ? (
                  <p className="text-sm italic text-muted-foreground">
                    Nothing is removed — this text will be added where your cursor is.
                  </p>
                ) : (
                  <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-foreground">
                    {previousText || "(Empty selection)"}
                  </pre>
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="flex min-h-0 flex-col md:max-h-[min(55vh,420px)]">
            <div className="shrink-0 border-b bg-primary/5 px-4 py-2 text-xs font-medium text-foreground">
              {variant === "insert" ? "Text to insert" : "New"}
            </div>
            <ScrollArea className="min-h-[140px] flex-1 md:max-h-[min(55vh,420px)]">
              <div className="p-4">
                <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-foreground">
                  {proposedText || "(Empty)"}
                </pre>
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-row justify-end gap-2 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            disabled={applying}
            onClick={onReject}
          >
            Discard
          </Button>
          <Button type="button" disabled={applying} onClick={onAccept}>
            {applying
              ? variant === "insert"
                ? "Inserting…"
                : "Applying…"
              : variant === "insert"
                ? "Insert"
                : "Accept changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
