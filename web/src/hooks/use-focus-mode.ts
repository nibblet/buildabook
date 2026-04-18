"use client";

import { useCallback, useEffect, useState } from "react";

const LS_KEY = "ui:focusMode";

export function useFocusMode() {
  const [focusMode, setFocusMode] = useState(false);

  // Restore from localStorage on mount.
  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored === "true") setFocusMode(true);
  }, []);

  // Sync to localStorage + body attribute whenever it changes.
  useEffect(() => {
    localStorage.setItem(LS_KEY, String(focusMode));
    document.body.setAttribute("data-focus-mode", String(focusMode));
    return () => {
      document.body.removeAttribute("data-focus-mode");
    };
  }, [focusMode]);

  // Esc to exit focus mode.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && focusMode) setFocusMode(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode]);

  const toggle = useCallback(() => setFocusMode((v) => !v), []);
  const enter = useCallback(() => setFocusMode(true), []);
  const exit = useCallback(() => setFocusMode(false), []);

  return { focusMode, toggle, enter, exit };
}
