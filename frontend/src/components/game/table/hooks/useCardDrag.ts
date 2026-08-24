"use client";

/**
 * Drag & drop for cards: press, cross a 5px threshold to start, then drop
 * on a battlefield/hand/zone target. A plain click (threshold never
 * crossed) on one of your own battlefield cards toggles tap instead.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Action, CardView, GameView, PlayerId, Zone } from "@cardessa/shared";
import { battlefieldDrop, findOwnCard } from "../foundation";

export type DragState = {
  uid: string;
  from: "battlefield" | "hand";
  x: number;
  y: number;
};

type PendingDrag = {
  card: CardView;
  zone: "battlefield" | "hand";
  startX: number;
  startY: number;
  started: boolean;
};

const DRAG_THRESHOLD_PX = 5;

export function useCardDrag({
  view,
  you,
  send,
  snap = false,
  onTap,
}: {
  view: GameView;
  you: PlayerId | null;
  send: (action: Action) => void;
  /** grid snapping preference — drops land on the 5% lattice */
  snap?: boolean;
  /** tap-toggle override (useManaPool's tapForMana — adds mana on tap-on) */
  onTap?: (card: CardView) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  /** anchors to YOUR board's container in whatever view mode is active */
  const battlefieldRef = useRef<HTMLDivElement | null>(null);
  const pending = useRef<PendingDrag | null>(null);

  /** Seed a potential drag from a left-press on one of your own battlefield
   *  or hand cards; every other press is ignored. The composite pointer-down
   *  handler in GameTable has already gated select/picking modes out. */
  const begin = useCallback(
    (card: CardView, event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      const own = findOwnCard(view, you, card.uid);
      if (!own || (own.zone !== "battlefield" && own.zone !== "hand")) return;
      pending.current = {
        card,
        zone: own.zone,
        startX: event.clientX,
        startY: event.clientY,
        started: false,
      };
    },
    [view, you]
  );

  const finishDrag = useCallback(
    (x: number, y: number) => {
      const current = drag;
      setDrag(null);
      if (!current) return;

      const element = document.elementFromPoint(x, y);
      if (!element) return;

      const dropTarget = element.closest<HTMLElement>("[data-drop]");
      const drop = dropTarget?.dataset.drop;
      if (drop === "battlefield" && battlefieldRef.current) {
        // positions are % of your board in your own frame, un-mirrored —
        // battlefieldDrop keeps the math in the owner's frame so views
        // stay in sync between players
        const pos = battlefieldDrop(
          battlefieldRef.current.getBoundingClientRect(),
          x,
          y,
          snap
        );
        if (current.from !== "battlefield") {
          send({ type: "MOVE_CARD", uid: current.uid, to: "battlefield" });
        }
        send({ type: "SET_POSITION", uid: current.uid, x: pos.x, y: pos.y });
        return;
      }
      if (drop === "hand") {
        send({ type: "MOVE_CARD", uid: current.uid, to: "hand" });
        return;
      }
      if (drop?.startsWith("zone:")) {
        send({ type: "MOVE_CARD", uid: current.uid, to: drop.slice(5) as Zone });
      }
    },
    [drag, send, snap]
  );

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const p = pending.current;
      if (!p) return;
      if (!p.started) {
        if (Math.hypot(event.clientX - p.startX, event.clientY - p.startY) < DRAG_THRESHOLD_PX) {
          return;
        }
        p.started = true;
        setDrag({ uid: p.card.uid, from: p.zone, x: event.clientX, y: event.clientY });
      } else {
        setDrag((d) => (d ? { ...d, x: event.clientX, y: event.clientY } : d));
      }
    }
    function onUp(event: PointerEvent) {
      const p = pending.current;
      pending.current = null;
      if (drag) {
        finishDrag(event.clientX, event.clientY);
        return;
      }
      if (p && !p.started && p.zone === "battlefield") {
        // plain click on an own battlefield card toggles tap
        if (onTap) onTap(p.card);
        else send({ type: "SET_TAPPED", uid: p.card.uid, value: !p.card.tapped });
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, finishDrag, send, onTap]);

  return { battlefieldRef, drag, draggedUid: drag?.uid ?? null, begin };
}
