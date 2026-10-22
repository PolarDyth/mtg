"use client";

/**
 * Attach placing (menu "Attach to…"): the next left click on one of your
 * own battlefield cards attaches; any other click or Escape cancels.
 */

import { useCallback, useEffect, useState } from "react";
import type { Action, CardView, GameView, PlayerId } from "@cardessa/shared";
import type { CardDef } from "@/lib/scryfall";
import { cardName, findOwnCard } from "../foundation";
import { arrowTargetAt } from "../hitTest";

export function useAttachPicking({
  view,
  you,
  send,
  get,
}: {
  view: GameView;
  you: PlayerId | null;
  send: (action: Action) => void;
  /** card-def lookup (names both ends in the server's chat line) */
  get: (id: string | null) => CardDef | null;
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
    // captured narrowed (hoisted function declarations below lose narrowing)
    const src: CardView = source;
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
        const host = findOwnCard(view, you, target.uid)?.card;
        send({
          type: "ATTACH_CARD",
          uid: fromUid,
          to: target.uid,
          name: cardName(get, src),
          ...(host ? { toName: cardName(get, host) } : {}),
        });
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [attachSource, view, you, send, get]);

  const escape = useCallback((): boolean => {
    if (!attachSource) return false;
    cancel();
    return true;
  }, [attachSource, cancel]);

  return { attachSource, attachTarget, start, cancel, escape };
}
