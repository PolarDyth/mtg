"use client";

/**
 * Hover zoom preview, the hovered-card memory shortcut binds act on, the
 * persisted preview width (ctrl/⌘ + scroll while previewing resizes), and
 * the dragged panel position (grab strip → drag → persisted x/y, clamped
 * to the viewport; null until first dragged = default bottom-left anchor).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { CardView } from "@cardessa/shared";
import type { CardDef } from "@/lib/scryfall";
import {
  clampPreviewPos,
  clearPreviewPos,
  loadPreviewPos,
  loadPreviewWidth,
  savePreviewPos,
  savePreviewWidth,
  clampPreviewWidth,
  type PreviewPos,
} from "@/lib/settings";
import { CARD_RATIO } from "../../CardSprite";
import { PREVIEW_GRIP_BLOCK } from "../../CardPreview";

export function useCardPreview() {
  const [zoom, setZoom] = useState<CardDef | null>(null);
  // card under the cursor (feeds hovered-card shortcuts; null when hidden)
  const [hoverCard, setHoverCard] = useState<CardView | null>(null);
  // user's preferred hover-preview width, persisted in localStorage
  const [previewWidth, setPreviewWidth] = useState(loadPreviewWidth);
  // panel position once dragged (null = default anchor); re-clamped to the
  // viewport at render time so a stale save never strands the panel offscreen
  const [pos, setPos] = useState<PreviewPos | null>(loadPreviewPos);
  const [dragging, setDragging] = useState(false);
  // the def being dragged: the cursor crosses empty board space mid-drag,
  // which clears `zoom` — this keeps the panel mounted until pointerup
  const [dragDef, setDragDef] = useState<CardDef | null>(null);
  const dragFrom = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState(() =>
    typeof window === "undefined"
      ? { w: 1024, h: 768 }
      : { w: window.innerWidth, h: window.innerHeight }
  );

  // hover feeds both the zoom preview and hovered-card shortcuts
  const onHover = useCallback((def: CardDef | null, card: CardView | null) => {
    setZoom(def);
    setHoverCard(card);
  }, []);

  const clearZoom = useCallback(() => setZoom(null), []);

  useEffect(() => {
    savePreviewWidth(previewWidth);
  }, [previewWidth]);

  const panelW = previewWidth + 8;
  const panelH = Math.round(previewWidth * CARD_RATIO) + PREVIEW_GRIP_BLOCK;
  const panelPos = pos ? clampPreviewPos(pos.x, pos.y, viewport.w, viewport.h, panelW, panelH) : null;

  const beginPanelDrag = useCallback(
    (event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      // anchor to where the panel actually is — the default anchor has no
      // stored coordinates, so measure the rendered element
      const rect = (event.currentTarget as HTMLElement)
        .closest<HTMLElement>("[data-preview-panel]")
        ?.getBoundingClientRect();
      const start = rect
        ? { x: rect.left, y: rect.top }
        : pos;
      if (!start) return;
      dragFrom.current = { px: event.clientX, py: event.clientY, x: start.x, y: start.y };
      setDragDef(zoom);
      setDragging(true);
    },
    [pos, zoom]
  );

  useEffect(() => {
    if (!dragging) return;
    function onMove(event: PointerEvent) {
      const from = dragFrom.current;
      if (!from) return;
      setPos(
        clampPreviewPos(
          from.x + event.clientX - from.px,
          from.y + event.clientY - from.py,
          window.innerWidth,
          window.innerHeight,
          panelW,
          panelH
        )
      );
    }
    function onUp() {
      setDragging(false);
      setDragDef(null);
      dragFrom.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // the sizes track previewWidth; re-registering mid-drag on a ctrl+scroll
    // resize is harmless (listeners are idempotent window add/removes)
  }, [dragging, panelW, panelH]);

  // persist only at rest — the in-flight drag state is clamped anyway
  useEffect(() => {
    if (pos && !dragging) savePreviewPos(pos);
  }, [pos, dragging]);

  useEffect(() => {
    function onResize() {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const resetPos = useCallback(() => {
    setPos(null);
    clearPreviewPos();
  }, []);

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

  return {
    zoom,
    hoverCard,
    previewWidth,
    setPreviewWidth,
    onHover,
    clearZoom,
    /** what the panel should show: the live hover target, else the def being
     *  dragged (keeps the panel mounted across empty board space) */
    panelDef: zoom ?? dragDef,
    dragging,
    panelPos,
    beginPanelDrag,
    resetPos,
  };
}
