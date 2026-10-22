"use client";

/**
 * Board selection: multi-select your own battlefield permanents with a
 * rubber-band drag from empty board space, ctrl/shift-click toggles, or
 * Ctrl+Alt+A select-all — then run bulk actions from the SelectionBar.
 * Selection is local UI state; bulk actions just send the same per-card
 * actions a click would, so the server sees nothing new.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Action, CardView, Zone } from "@cardessa/shared";
import { marqueeSelect, type Rect } from "../foundation";
import type { KeybindSlice } from "../keybinds";

/** The rubber band in px relative to the board div (overlay positioning). */
export type MarqueeRect = { left: number; top: number; width: number; height: number };

const DRAG_THRESHOLD_PX = 5;

export function useBoardSelection({
  send,
  battlefield,
  boardRef,
}: {
  send: (action: Action) => void;
  battlefield: CardView[];
  boardRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  // an empty-space press: becomes a marquee past the threshold, or a plain
  // click (which clears the selection) otherwise
  const pending = useRef<{ startX: number; startY: number; started: boolean } | null>(null);

  const byUid = useMemo(
    () => new Map(battlefield.map((card) => [card.uid, card])),
    [battlefield]
  );
  // uids that still resolve to a card on your board (bulk sends move them,
  // snapshots remove them)
  const selectedOnBoard = useMemo(
    () => [...selected].filter((uid) => byUid.has(uid)),
    [selected, byUid]
  );
  const hasSelection = selectedOnBoard.length > 0;

  const clear = useCallback(() => setSelected(new Set()), []);

  const toggle = useCallback((uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }, []);

  const beginMarquee = useCallback((event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    // presses on a card belong to the card (drag / tap / select-toggle)
    if ((event.target as Element | null)?.closest?.("[data-card-uid]")) return;
    pending.current = { startX: event.clientX, startY: event.clientY, started: false };
  }, []);

  const selectInBox = useCallback(
    (box: Rect) => {
      const el = boardRef.current;
      if (!el) return;
      const cardRects = [...el.querySelectorAll<HTMLElement>("[data-card-uid]")].map(
        (node) => {
          const r = node.getBoundingClientRect();
          return {
            uid: node.dataset.cardUid ?? "",
            rect: { left: r.left, top: r.top, width: r.width, height: r.height },
          };
        }
      );
      setSelected(
        new Set(marqueeSelect(box, cardRects).filter((uid) => byUid.has(uid)))
      );
    },
    [boardRef, byUid]
  );

  useEffect(() => {
    function boxFor(x1: number, y1: number, x2: number, y2: number): {
      box: Rect;
      rect: MarqueeRect | null;
    } {
      const box = {
        left: Math.min(x1, x2),
        top: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      };
      const board = boardRef.current?.getBoundingClientRect();
      return {
        box,
        rect: board
          ? {
              left: box.left - board.left,
              top: box.top - board.top,
              width: box.width,
              height: box.height,
            }
          : null,
      };
    }

    function onMove(event: PointerEvent) {
      const p = pending.current;
      if (!p) return;
      if (!p.started) {
        if (Math.hypot(event.clientX - p.startX, event.clientY - p.startY) < DRAG_THRESHOLD_PX) {
          return;
        }
        p.started = true;
      }
      setMarqueeRect(boxFor(p.startX, p.startY, event.clientX, event.clientY).rect);
    }

    function onUp(event: PointerEvent) {
      const p = pending.current;
      pending.current = null;
      if (!p) return;
      if (p.started) {
        selectInBox(boxFor(p.startX, p.startY, event.clientX, event.clientY).box);
      } else {
        setSelected(new Set()); // plain click on empty space clears
      }
      setMarqueeRect(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [boardRef, selectInBox]);

  // --- bulk actions: per-card sends exactly like hand selection does --------

  const tapSelected = useCallback(
    (value: boolean) => {
      for (const uid of selectedOnBoard) {
        const card = byUid.get(uid);
        if (card && card.tapped !== value) {
          send({ type: "SET_TAPPED", uid, value });
        }
      }
      clear();
    },
    [selectedOnBoard, byUid, send, clear]
  );

  const buffSelected = useCallback(() => {
    for (const uid of selectedOnBoard) {
      const card = byUid.get(uid);
      if (!card) continue;
      send({
        type: "SET_COUNTERS",
        uid,
        counters: { ...card.counters, "+1/+1": (card.counters["+1/+1"] ?? 0) + 1 },
      });
    }
    clear();
  }, [selectedOnBoard, byUid, send, clear]);

  const moveSelected = useCallback(
    (to: Zone, index?: "bottom") => {
      for (const uid of selectedOnBoard) {
        send({ type: "MOVE_CARD", uid, to, ...(index !== undefined ? { index } : {}) });
      }
      clear();
    },
    [selectedOnBoard, send, clear]
  );

  // catch-all Escape tier: clear the selection (always lets the rest run),
  // mirroring hand selection's escape
  const escape = useCallback((): boolean => {
    if (hasSelection) setSelected(new Set());
    return false;
  }, [hasSelection]);

  const keybinds = {
    boardSelectAll: () => setSelected(new Set(battlefield.map((c) => c.uid))),
  } satisfies KeybindSlice;

  return {
    selected,
    selectedOnBoard,
    hasSelection,
    marqueeRect,
    beginMarquee,
    toggle,
    clear,
    tapSelected,
    buffSelected,
    moveSelected,
    escape,
    keybinds,
  };
}
