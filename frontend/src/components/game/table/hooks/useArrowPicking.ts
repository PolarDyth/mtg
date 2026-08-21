"use client";

/**
 * Arrow drawing (menu "Draw arrow to…", Alt+A over a card, or
 * ctrl/⌘+right-click): the rubber band follows the cursor; the next left
 * click on a card or player head commits; any other click or Escape cancels.
 */

import {
  useCallback,
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Action, CardView, GameView, PlayerId } from "@mythic/shared";
import { findOwnHovered, onAnyBattlefield } from "../foundation";
import { arrowTargetAt } from "../hitTest";
import type { KeybindSlice } from "../keybinds";

export function useArrowPicking({
  view,
  you,
  send,
  hoverCard,
}: {
  view: GameView;
  you: PlayerId | null;
  send: (action: Action) => void;
  hoverCard: CardView | null;
}) {
  // arrow source chosen (menu, Alt+A, or ctrl+right-click) — target pending
  const [arrowPicking, setArrowPicking] = useState<CardView | null>(null);
  // live rubber band while picking a target
  const [arrowDraft, setArrowDraft] = useState<{
    fromUid: string;
    x: number;
    y: number;
  } | null>(null);
  // hovered arrow target while drawing (drives the highlight rings)
  const [arrowTarget, setArrowTarget] = useState<{
    uid?: string;
    playerId?: PlayerId;
  } | null>(null);

  const start = useCallback((card: CardView) => setArrowPicking(card), []);

  const cancel = useCallback(() => {
    setArrowPicking(null);
    setArrowDraft(null);
    setArrowTarget(null);
  }, []);

  /** ctrl/⌘ + right-click entry from the composite pointer-down handler:
   *  returns true when the press started a sticky arrow. Plain
   *  right-clicks (the card menu) return false and fall through. */
  const maybeStartFromPointer = useCallback(
    (card: CardView, event: ReactPointerEvent): boolean => {
      if (event.button !== 2) return false;
      if ((event.ctrlKey || event.metaKey) && onAnyBattlefield(view, card.uid)) {
        setArrowPicking(card);
        setArrowDraft({
          fromUid: card.uid,
          x: event.clientX,
          y: event.clientY,
        });
        return true;
      }
      return false;
    },
    [view]
  );

  const commitArrow = useCallback(
    (fromUid: string, x: number, y: number) => {
      const target = arrowTargetAt(x, y);
      if (!target || ("uid" in target && target.uid === fromUid)) return;
      send({ type: "DRAW_ARROW", fromUid, to: target });
    },
    [send]
  );

  useEffect(() => {
    const source = arrowPicking;
    if (!source) return;
    const fromUid = source.uid;
    function onMove(event: PointerEvent) {
      setArrowDraft({ fromUid, x: event.clientX, y: event.clientY });
      const target = arrowTargetAt(event.clientX, event.clientY);
      setArrowTarget(
        target && !("uid" in target && target.uid === fromUid) ? target : null
      );
    }
    function onUp(event: PointerEvent) {
      if (event.button !== 0) return;
      setArrowPicking(null);
      setArrowDraft(null);
      setArrowTarget(null);
      if (arrowTargetAt(event.clientX, event.clientY)) {
        commitArrow(fromUid, event.clientX, event.clientY);
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [arrowPicking, commitArrow]);

  const escape = useCallback((): boolean => {
    if (!arrowPicking && !arrowDraft) return false;
    cancel();
    return true;
  }, [arrowPicking, arrowDraft, cancel]);

  const keybinds: KeybindSlice = {
    arrowFromHover: () => {
      const own = findOwnHovered(view, you, hoverCard);
      if (own?.zone === "battlefield") setArrowPicking(own.card);
    },
    removeMyArrows: () => {
      if (you) send({ type: "CLEAR_ARROWS", playerId: you });
    },
  };

  return {
    arrowPicking,
    arrowDraft,
    arrowTarget,
    start,
    maybeStartFromPointer,
    cancel,
    escape,
    keybinds,
  };
}
