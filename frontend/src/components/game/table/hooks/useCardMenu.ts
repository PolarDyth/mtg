"use client";

/**
 * Right-click card menu (plus the library pile's right-click menu) and the
 * counter-editor popover it launches. The popover's card is re-derived from
 * every snapshot, so it never goes stale — and closes once the card leaves
 * your zones.
 */

import { useCallback, useState } from "react";
import type { Action, CardView, GameView, PlayerId } from "@mythic/shared";
import type { CardDef } from "@/lib/scryfall";
import type { MenuState } from "../../ContextMenu";
import { faceDef, findOwnCard, onAnyBattlefield } from "../foundation";

export function useCardMenu({
  view,
  you,
  get,
  send,
}: {
  view: GameView;
  you: PlayerId | null;
  get: (id: string | null) => CardDef | null;
  send: (action: Action) => void;
}) {
  const [menu, setMenu] = useState<MenuState>(null);
  // counter editor: card uid + anchor position
  const [countersFor, setCountersFor] = useState<{
    uid: string;
    x: number;
    y: number;
  } | null>(null);

  const open = useCallback(
    (card: CardView, x: number, y: number) => {
      const found = findOwnCard(view, you, card.uid);
      const own = !!found;
      // own cards get the full menu; an opponent's battlefield card gets the
      // reduced one (clone it / spawn its tokens)
      if (!own && !onAnyBattlefield(view, card.uid)) return;
      setMenu({
        kind: "card",
        card,
        own,
        zone: found?.zone ?? "battlefield",
        // reveal labels name whichever face is showing
        name: faceDef(get(card.cardId), card.showBack)?.name ?? card.annotations[0] ?? "Card",
        x,
        y,
      });
    },
    [view, you, get]
  );

  const openLibrary = useCallback(
    (x: number, y: number) => setMenu({ kind: "library", x, y }),
    []
  );

  const close = useCallback(() => setMenu(null), []);

  const openCounters = useCallback((card: CardView, x: number, y: number) => {
    setCountersFor({ uid: card.uid, x, y });
  }, []);

  const closeCounters = useCallback(() => setCountersFor(null), []);

  // live card for the counter popover (null once the card is gone — closes it)
  const countersCard = countersFor
    ? findOwnCard(view, you, countersFor.uid)
    : null;

  const addNote = useCallback(
    (card: CardView) => {
      const note = window.prompt("Sticky note for this card (leave empty to clear)");
      if (note === null) return;
      const trimmed = note.trim();
      const existing = card.annotations.filter((a) => a.trim() !== "");
      const notes = trimmed
        ? [...existing.filter((a) => a !== trimmed), trimmed].slice(0, 8)
        : existing.filter((a) => a !== "");
      send({ type: "SET_NOTES", uid: card.uid, notes });
    },
    [send]
  );

  // catch-all Escape tier
  const escape = useCallback((): boolean => {
    setCountersFor(null);
    setMenu(null);
    return false;
  }, []);

  return {
    menu,
    open,
    openLibrary,
    close,
    countersFor,
    countersCard,
    openCounters,
    closeCounters,
    addNote,
    escape,
  };
}
