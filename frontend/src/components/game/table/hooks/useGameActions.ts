"use client";

/**
 * Direct-send game keybinds: the ones with no UI beyond the action itself
 * (draw one, untap all, shuffle, roll, mill one, play the top card, phase /
 * turn advancement, random discard) plus the board-wide +1/+1 buff shared
 * with the Actions dock. Pile-viewing binds live in usePileViewer instead.
 */

import type { Action, GameView, PlayerView } from "@mythic/shared";
import type { CardDef } from "@/lib/scryfall";
import { isCreature, nextPhaseAction } from "../foundation";
import type { KeybindSlice } from "../keybinds";

export function useGameActions({
  view,
  self,
  send,
  get,
}: {
  view: GameView;
  self: PlayerView | null;
  send: (action: Action) => void;
  /** card-def lookup (creature detection for the board buff) */
  get: (id: string | null) => CardDef | null;
}) {
  /** +1/+1 on every creature you control — merge-commits, so existing
   *  counter kinds ride along and only +1/+1 increments. */
  function buffCreatures() {
    const board =
      self?.zones.battlefield.kind === "cards" ? self.zones.battlefield.cards : [];
    for (const card of board) {
      if (!isCreature(card, get)) continue;
      send({
        type: "SET_COUNTERS",
        uid: card.uid,
        counters: {
          ...card.counters,
          "+1/+1": (card.counters["+1/+1"] ?? 0) + 1,
        },
      });
    }
  }

  // satisfies (not an annotation) keeps the keys required, so the
  // exhaustive composition in GameTable fails tsc on any gap
  const keybinds = {
    drawOne: () => send({ type: "DRAW_CARDS", count: 1 }),
    nextTurn: () => send(nextPhaseAction(view.phase)),
    passTurn: () => send({ type: "NEXT_TURN" }),
    undoTurn: () => send({ type: "UNDO_TURN" }),
    untapAll: () => {
      const cards =
        self?.zones.battlefield.kind === "cards" ? self.zones.battlefield.cards : [];
      for (const card of cards) {
        if (card.tapped) send({ type: "SET_TAPPED", uid: card.uid, value: false });
      }
    },
    buffCreatures,
    shuffleLibrary: () => send({ type: "SHUFFLE_LIBRARY" }),
    rollDie: () => send({ type: "ROLL_DIE", sides: 20 }),
    millOne: () => send({ type: "MILL_CARDS", count: 1 }),
    randomDiscard: () => send({ type: "DISCARD_RANDOM", count: 1 }),
    playTopCard: () => {
      const top =
        self?.zones.library.kind === "cards" ? self.zones.library.cards[0] : undefined;
      if (top) send({ type: "MOVE_CARD", uid: top.uid, to: "battlefield" });
    },
  } satisfies KeybindSlice;
  return { keybinds, buffCreatures };
}
