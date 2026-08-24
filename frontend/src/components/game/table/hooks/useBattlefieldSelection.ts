"use client";

/**
 * Multi-select for your own battlefield permanents: a marquee band from
 * empty board space and ctrl/shift-click toggles feed one selection the
 * SelectionBar acts on (tap / untap / +1/+1 each / zone moves) — actions
 * loop per-card send exactly like hand selection, no protocol changes.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { Action, CardView, Zone } from "@cardessa/shared";
import { marqueeRect, rectsIntersect } from "../foundation";
import type { KeybindSlice } from "../keybinds";

const MARQUEE_THRESHOLD_PX = 5;

type Marquee = { x0: number; y0: number; x: number; y: number };

export function useBattlefieldSelection({
  send,
  battlefield,
  battlefieldRef,
}: {
  send: (action: Action) => void;
  /** your battlefield cards from the live snapshot */
  battlefield: CardView[];
  /** anchors to YOUR board's container in whatever view mode is active */
  battlefieldRef: RefObject<HTMLDivElement | null>;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  /** a press on empty board space is being held (listeners attached) */
  const [armed, setArmed] = useState(false);
  /** the band itself — only set once the press crosses the threshold */
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  /** uids under the live band — the drag preview of the commit */
  const [bandLive, setBandLive] = useState<Set<string>>(() => new Set());
  const start = useRef<{ x: number; y: number } | null>(null);

  const ownBoard = useMemo(() => new Set(battlefield.map((c) => c.uid)), [battlefield]);
  // stale uids (card left the board mid-selection) drop out of every action
  const selectedOnBoard = [...selected].filter((uid) => ownBoard.has(uid));

  /** uids ringed right now: the committed selection plus the live band */
  const highlighted = new Set([...selectedOnBoard, ...bandLive]);

  const hitTest = useCallback(
    (m: Marquee): Set<string> => {
      const board = battlefieldRef.current;
      const hits = new Set<string>();
      if (!board) return hits;
      const rect = marqueeRect(m);
      for (const el of board.querySelectorAll<HTMLElement>("[data-card-uid]")) {
        const uid = el.dataset.cardUid;
        if (uid && ownBoard.has(uid) && rectsIntersect(rect, el.getBoundingClientRect())) {
          hits.add(uid);
        }
      }
      return hits;
    },
    [battlefieldRef, ownBoard]
  );

  /** pointerdown on YOUR board's empty space. A press that starts on a card
   *  bubbles here too — those belong to drag/tap, so they're excluded. */
  const beginMarquee = useCallback((event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-card-uid]")) return;
    start.current = { x: event.clientX, y: event.clientY };
    setArmed(true);
  }, []);

  /** ctrl/shift+left-click on one of your battlefield cards toggles it into
   *  (or out of) the selection; anything else falls through the pointer
   *  chain untouched. */
  const tryToggleFromPointer = useCallback(
    (card: CardView, event: ReactPointerEvent): boolean => {
      if (event.button !== 0) return false;
      if (!event.ctrlKey && !event.shiftKey) return false;
      if (!ownBoard.has(card.uid)) return false;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(card.uid)) next.delete(card.uid);
        else next.add(card.uid);
        return next;
      });
      return true;
    },
    [ownBoard]
  );

  useEffect(() => {
    if (!armed) return;
    function onMove(event: PointerEvent) {
      const from = start.current;
      if (!from) return;
      if (Math.hypot(event.clientX - from.x, event.clientY - from.y) < MARQUEE_THRESHOLD_PX) {
        return;
      }
      const m = { x0: from.x, y0: from.y, x: event.clientX, y: event.clientY };
      setMarquee(m);
      setBandLive(hitTest(m));
    }
    function onUp(event: PointerEvent) {
      const from = start.current;
      start.current = null;
      setArmed(false);
      setMarquee(null);
      setBandLive(new Set());
      if (!from) return;
      // a completed band replaces the selection; a plain click on empty
      // board space (threshold never crossed) clears it
      if (Math.hypot(event.clientX - from.x, event.clientY - from.y) >= MARQUEE_THRESHOLD_PX) {
        setSelected(hitTest({ x0: from.x, y0: from.y, x: event.clientX, y: event.clientY }));
      } else {
        setSelected(new Set());
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // hitTest tracks the live snapshot; re-registering mid-band on a board
    // change is harmless (idempotent window add/removes)
  }, [armed, hitTest]);

  const clear = useCallback(() => {
    setSelected(new Set());
    setBandLive(new Set());
  }, []);

  const tapSelected = useCallback(
    (value: boolean) => {
      for (const uid of selectedOnBoard) {
        const card = battlefield.find((c) => c.uid === uid);
        if (card && card.tapped !== value) {
          send({ type: "SET_TAPPED", uid, value });
        }
      }
      clear();
    },
    [selectedOnBoard, battlefield, send, clear]
  );

  const buffSelected = useCallback(() => {
    for (const uid of selectedOnBoard) {
      const card = battlefield.find((c) => c.uid === uid);
      if (!card) continue;
      send({
        type: "SET_COUNTERS",
        uid,
        counters: { ...card.counters, "+1/+1": (card.counters["+1/+1"] ?? 0) + 1 },
      });
    }
    clear();
  }, [selectedOnBoard, battlefield, send, clear]);

  const moveSelected = useCallback(
    (to: Zone) => {
      for (const uid of selectedOnBoard) {
        send({
          type: "MOVE_CARD",
          uid,
          to,
          ...(to === "library" ? { index: "bottom" as const } : {}),
        });
      }
      clear();
    },
    [selectedOnBoard, send, clear]
  );

  // catch-all Escape tier: drop band + selection, let the rest of the chain run
  const escape = useCallback((): boolean => {
    start.current = null;
    setArmed(false);
    setMarquee(null);
    setBandLive(new Set());
    clear();
    return false;
  }, [clear]);

  const keybinds = {
    selectAllPermanents: () => setSelected(new Set(battlefield.map((c) => c.uid))),
  } satisfies KeybindSlice;

  return {
    selectedOnBoard,
    highlighted,
    marqueeView: marquee ? marqueeRect(marquee) : null,
    beginMarquee,
    tryToggleFromPointer,
    tapSelected,
    buffSelected,
    moveSelected,
    clear,
    escape,
    keybinds,
  };
}
