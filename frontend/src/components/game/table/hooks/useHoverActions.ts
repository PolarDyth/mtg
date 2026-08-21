"use client";

/**
 * Hovered-card keybinds (Alt+A arrow, Alt+T tap, Alt+H attach, Alt+F flip,
 * Alt+B transform, Ctrl+Delete graveyard, Ctrl+B bottom, Alt+N note): they
 * act on the card under the cursor, but only where that card is one of
 * your own.
 */

import type { Action, CardView, GameView, PlayerId } from "@mythic/shared";
import type { CardDef } from "@/lib/scryfall";
import { findOwnHovered } from "../foundation";
import type { KeybindSlice } from "../keybinds";

export function useHoverActions({
  view,
  you,
  send,
  get,
  hoverCard,
  addNote,
  startAttach,
  onTap,
}: {
  view: GameView;
  you: PlayerId | null;
  send: (action: Action) => void;
  /** card-def lookup (transform needs the def's back face) */
  get: (id: string | null) => CardDef | null;
  hoverCard: CardView | null;
  addNote: (card: CardView) => void;
  /** begins "Attach to…" targeting from the hovered card (useAttachPicking) */
  startAttach: (card: CardView) => void;
  /** tap-toggle override (useManaPool's tapForMana — adds mana on tap-on) */
  onTap?: (card: CardView) => void;
}) {
  // satisfies (not an annotation) keeps the keys required, so the
  // exhaustive composition in GameTable fails tsc on any gap
  const keybinds = {
    tapHover: () => {
      const own = findOwnHovered(view, you, hoverCard);
      if (own?.zone === "battlefield") {
        if (onTap) onTap(own.card);
        else send({ type: "SET_TAPPED", uid: own.card.uid, value: !own.card.tapped });
      }
    },
    attachHover: () => {
      const own = findOwnHovered(view, you, hoverCard);
      if (own?.zone === "battlefield") startAttach(own.card);
    },
    flipHover: () => {
      const own = findOwnHovered(view, you, hoverCard);
      if (own?.zone === "battlefield") {
        send({ type: "SET_FACE_DOWN", uid: own.card.uid, value: !own.card.faceDown });
      }
    },
    transformHover: () => {
      const own = findOwnHovered(view, you, hoverCard);
      if (own?.zone !== "battlefield" || !own.card.cardId || own.card.faceDown) return;
      const def = get(own.card.cardId);
      if (!def?.back) return;
      send({
        type: "TRANSFORM_CARD",
        uid: own.card.uid,
        name: own.card.showBack ? def.name : def.back.name,
      });
    },
    graveyardHover: () => {
      const own = findOwnHovered(view, you, hoverCard);
      if (own) send({ type: "MOVE_CARD", uid: own.card.uid, to: "graveyard" });
    },
    bottomHover: () => {
      const own = findOwnHovered(view, you, hoverCard);
      if (own) {
        send({ type: "MOVE_CARD", uid: own.card.uid, to: "library", index: "bottom" });
      }
    },
    noteHover: () => {
      if (hoverCard && findOwnHovered(view, you, hoverCard)) addNote(hoverCard);
    },
  } satisfies KeybindSlice;
  return { keybinds };
}
