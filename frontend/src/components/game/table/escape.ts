"use client";

import { useEffect } from "react";

/**
 * Escape-key cascade: entries run in priority order; the first one that
 * returns true ("consumed") stops the chain. Priority features (maximize,
 * reveal popup, audience picker, arrow picking, attach picking) return true
 * only when their thing was open; everything else closes and returns false,
 * so the catch-all tier still all runs together when no priority tier
 * matched — exactly the cascade GameTable had inline.
 */
export function useEscapeChain(chain: Array<() => boolean>): void {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      for (const close of chain) {
        if (close()) return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chain]);
}
