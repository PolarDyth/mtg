"use client";

/**
 * Hovered-card keybinds (Alt+F flip, Ctrl+Delete graveyard, Ctrl+B bottom,
 * Alt+N note): they act on the card under the cursor, but only where that
 * card is one of your own.
 */

import type { Action, CardView, GameView, PlayerId } from "@mythic/shared";
import { findOwnHovered } from "../foundation";
import type { KeybindSlice } from "../keybinds";

export function useHoverActions({
  view,
  you,
  send,
  hoverCard,
  addNote,
}: {
  view: GameView;
  you: PlayerId | null;
  send: (action: Action) => void;
  hoverCard: CardView | null;
  addNote: (card: CardView) => void;
}) {
  // satisfies (not an annotation) keeps the keys required, so the
  // exhaustive composition in GameTable fails tsc on any gap
  const keybinds = {
    flipHover: () => {
      const own = findOwnHovered(view, you, hoverCard);
      if (own?.zone === "battlefield") {
        send({ type: "SET_FACE_DOWN", uid: own.card.uid, value: !own.card.faceDown });
      }
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
