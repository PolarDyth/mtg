"use client";

/**
 * The synced mana pool: whole-record SET_MANA senders (the band-header pip
 * controls and Alt+C clear) plus the tap convenience — tapping one of your
 * own cards adds its produced colors alongside the normal SET_TAPPED. The
 * pool is public bookkeeping; nothing here ever drains it automatically.
 */

import { useCallback } from "react";
import {
  emptyMana,
  type Action,
  type CardView,
  type ManaColor,
  type ManaPool,
  type PlayerView,
} from "@cardessa/shared";
import type { CardDef } from "@/lib/scryfall";
import { manaAfterSpend, manaAfterTap } from "../foundation";
import type { KeybindSlice } from "../keybinds";

export function useManaPool({
  self,
  send,
}: {
  self: PlayerView | null;
  send: (action: Action) => void;
}) {
  const commit = useCallback(
    (mana: ManaPool) => send({ type: "SET_MANA", mana }),
    [send]
  );

  const addMana = useCallback(
    (color: ManaColor) => {
      if (!self) return;
      commit({ ...self.mana, [color]: Math.min(99, self.mana[color] + 1) });
    },
    [self, commit]
  );

  const spendMana = useCallback(
    (color: ManaColor) => {
      if (!self) return;
      commit(manaAfterSpend(self.mana, color, 1));
    },
    [self, commit]
  );

  const clearMana = useCallback(() => commit(emptyMana()), [commit]);

  /** Every tap-ON of your own card, from all three tap paths (plain click,
   *  Alt+T, the menu item): normal tap toggle plus, when the def lists
   *  produced_mana, one of each distinct color into the pool. Untapping
   *  (the same toggle the other way) never subtracts. */
  const tapForMana = useCallback(
    (card: CardView, def: CardDef | null) => {
      if (!card.tapped && def && def.produced_mana.length > 0 && self) {
        commit(manaAfterTap(self.mana, def.produced_mana));
      }
      send({ type: "SET_TAPPED", uid: card.uid, value: !card.tapped });
    },
    [self, commit, send]
  );

  const keybinds = {
    clearManaPool: clearMana,
  } satisfies KeybindSlice;

  return { keybinds, addMana, spendMana, clearMana, tapForMana };
}
