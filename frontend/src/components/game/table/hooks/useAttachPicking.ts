"use client";

/**
 * Attach placing (menu "Attach to…"): the next left click on one of your
 * own battlefield cards attaches; any other click or Escape cancels.
 */

import { useCallback, useEffect, useState } from "react";
import type { Action, CardView, GameView, PlayerId } from "@mythic/shared";
import { findOwnCard } from "../foundation";
import { arrowTargetAt } from "../hitTest";

export function useAttachPicking({
  view,
  you,
  send,
}: {
  view: GameView;
  you: PlayerId | null;
  send: (action: Action) => void;
}) {
  // attach targeting: source card chosen, target pending
  const [attachSource, setAttachSource] = useState<CardView | null>(null);
  // hovered attach target while picking (drives the highlight ring)
  const [attachTarget, setAttachTarget] = useState<string | null>(null);

  const start = useCallback((card: CardView) => setAttachSource(card), []);

  const cancel = useCallback(() => {
    setAttachSource(null);
    setAttachTarget(null);
  }, []);

  useEffect(() => {
    const source = attachSource;
    if (!source) return;
    const fromUid = source.uid;
    function onMove(event: PointerEvent) {
      const target = arrowTargetAt(event.clientX, event.clientY);
      const uid =
        target && "uid" in target && target.uid !== fromUid ? target.uid : null;
      // hosts must sit on your own battlefield (server rule) — only those
      // get the highlight ring
      setAttachTarget(
        uid && findOwnCard(view, you, uid)?.zone === "battlefield" ? uid : null
      );
    }
    function onUp(event: PointerEvent) {
      if (event.button !== 0) return;
      setAttachSource(null);
      setAttachTarget(null);
      const target = arrowTargetAt(event.clientX, event.clientY);
      if (target && "uid" in target && target.uid !== fromUid) {
        send({ type: "ATTACH_CARD", uid: fromUid, to: target.uid });
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [attachSource, view, you, send]);

  const escape = useCallback((): boolean => {
    if (!attachSource) return false;
    cancel();
    return true;
  }, [attachSource, cancel]);

  return { attachSource, attachTarget, start, cancel, escape };
}
