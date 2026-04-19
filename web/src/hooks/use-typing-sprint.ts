import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

const WINDOW_MS = 30_000;
/** Many rapid edits in a short window — likely drafting sprint (suppress Tier B noise). */
const TRANSACTION_BURST = 45;

export function transactionBurstForSprint(timestamps: number[], now: number): boolean {
  const cutoff = now - WINDOW_MS;
  let n = 0;
  for (let i = timestamps.length - 1; i >= 0; i--) {
    if (timestamps[i] >= cutoff) n++;
    else break;
  }
  return n >= TRANSACTION_BURST;
}

export function useTypingSprint(editor: Editor | null): { isSprinting: boolean } {
  const stampsRef = useRef<number[]>([]);
  const [isSprinting, setIsSprinting] = useState(false);

  useEffect(() => {
    if (!editor) return;
    const onTr = ({
      transaction,
    }: {
      transaction: import("@tiptap/pm/state").Transaction;
    }) => {
      if (!transaction.docChanged) return;
      const now = Date.now();
      stampsRef.current.push(now);
      const cutoff = now - WINDOW_MS;
      stampsRef.current = stampsRef.current.filter((t) => t >= cutoff);
      setIsSprinting(transactionBurstForSprint(stampsRef.current, now));
    };
    editor.on("transaction", onTr);
    return () => {
      void editor.off("transaction", onTr);
      setIsSprinting(false);
      stampsRef.current = [];
    };
  }, [editor]);

  return { isSprinting };
}
