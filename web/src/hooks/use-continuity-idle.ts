import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";

const IDLE_MS = 8000;

/** True when the user has not triggered an editor transaction for IDLE_MS. */
export function useContinuityIdle(editor: Editor | null): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!editor) return;
    let t: ReturnType<typeof setTimeout>;
    function arm() {
      clearTimeout(t);
      setIdle(false);
      t = setTimeout(() => setIdle(true), IDLE_MS);
    }
    arm();
    const onTr = () => arm();
    editor.on("transaction", onTr);
    return () => {
      clearTimeout(t);
      void editor.off("transaction", onTr);
    };
  }, [editor]);

  return idle;
}
