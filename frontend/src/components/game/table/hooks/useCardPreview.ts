"use client";

/**
 * Hover zoom preview, the hovered-card memory shortcut binds act on, and
 * the persisted preview width (ctrl/⌘ + scroll while previewing resizes).
 */

import { useCallback, useEffect, useState } from "react";
import type { CardView } from "@mythic/shared";
import type { CardDef } from "@/lib/scryfall";
import { clampPreviewWidth, loadPreviewWidth, savePreviewWidth } from "@/lib/settings";

export function useCardPreview() {
  const [zoom, setZoom] = useState<CardDef | null>(null);
  // card under the cursor (feeds hovered-card shortcuts; null when hidden)
  const [hoverCard, setHoverCard] = useState<CardView | null>(null);
  // user's preferred hover-preview width, persisted in localStorage
  const [previewWidth, setPreviewWidth] = useState(loadPreviewWidth);

  // hover feeds both the zoom preview and hovered-card shortcuts
  const onHover = useCallback((def: CardDef | null, card: CardView | null) => {
    setZoom(def);
    setHoverCard(card);
  }, []);

  const clearZoom = useCallback(() => setZoom(null), []);

  useEffect(() => {
    savePreviewWidth(previewWidth);
  }, [previewWidth]);

  // ctrl/⌘ + scroll while a preview is showing resizes it — the only time we
  // claim the gesture; plain scrolling (and pinch-zoom elsewhere) stays native
  useEffect(() => {
    function onWheel(event: WheelEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (!zoom) return;
      event.preventDefault();
      setPreviewWidth((w) => clampPreviewWidth(w + (event.deltaY < 0 ? 16 : -16)));
    }
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [zoom]);

  return { zoom, hoverCard, previewWidth, setPreviewWidth, onHover, clearZoom };
}
