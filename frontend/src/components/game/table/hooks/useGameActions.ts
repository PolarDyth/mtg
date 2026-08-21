"use client";

/**
 * Direct-send game keybinds: the ones with no UI beyond the action itself
 * (draw one, untap all, shuffle, roll, mill one, play the top card, phase /
 * turn advancement). Pile-viewing binds live in usePileViewer instead.
 */

import type { Action, GameView, PlayerView } from "@mythic/shared";
import { nextPhaseAction } from "../foundation";
import type { KeybindSlice } from "../keybinds";

export function useGameActions({
  view,
  self,
  send,
}: {
  view: GameView;
  self: PlayerView | null;
  send: (action: Action) => void;
}) {
  // satisfies (not an annotation) keeps the keys required, so the
  // exhaustive composition in GameTable fails tsc on any gap
  const keybinds = {
    drawOne: () => send({ type: "DRAW_CARDS", count: 1 }),
    nextTurn: () => send(nextPhaseAction(view.phase)),
    passTurn: () => send({ type: "NEXT_TURN" }),
    untapAll: () => {
      const cards =
        self?.zones.battlefield.kind === "cards" ? self.zones.battlefield.cards : [];
      for (const card of cards) {
        if (card.tapped) send({ type: "SET_TAPPED", uid: card.uid, value: false });
      }
    },
    shuffleLibrary: () => send({ type: "SHUFFLE_LIBRARY" }),
    rollDie: () => send({ type: "ROLL_DIE", sides: 20 }),
    millOne: () => send({ type: "MILL_CARDS", count: 1 }),
    playTopCard: () => {
      const top =
        self?.zones.library.kind === "cards" ? self.zones.library.cards[0] : undefined;
      if (top) send({ type: "MOVE_CARD", uid: top.uid, to: "battlefield" });
    },
  } satisfies KeybindSlice;
  return { keybinds };
}
