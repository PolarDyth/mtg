"use client";

/**
 * Grid-snapping preference (mtg:grid-snap): when on, card drops land on a
 * 5% lattice of your board for tidy rows. useCardDrag consumes it;
 * TableHeader's display popover toggles it, as does its keybind.
 */

import { useCallback, useEffect, useState } from "react";
import { loadGridSnap, saveGridSnap } from "@/lib/settings";
import type { KeybindSlice } from "../keybinds";

export function useGridSnap() {
  const [gridSnap, setGridSnapState] = useState(loadGridSnap);

  useEffect(() => {
    saveGridSnap(gridSnap);
  }, [gridSnap]);

  const setGridSnap = useCallback((value: boolean) => setGridSnapState(value), []);

  const keybinds = {
    toggleGridSnap: () => setGridSnapState((v) => !v),
  } satisfies KeybindSlice;

  return { gridSnap, setGridSnap, keybinds };
}
