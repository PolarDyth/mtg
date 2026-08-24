"use client";

/**
 * The synced mana pool: whole-record SET_MANA senders (the band-header pip
 * controls and Alt+C clear) plus the tap convenience — tapping one of your
 * own cards adds the showing face's parsed yield alongside the normal
 * SET_TAPPED. The pool is public bookkeeping; the engine never drains it —
 * the optional auto-clear preference (useAutoClearMana) sends an explicit
 * client-side SET_MANA when the phase or turn advances.
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
import {
  faceOracleText,
  manaAfterSpend,
  manaAfterTap,
  tapManaYield,
} from "../foundation";
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
   *  Alt+T, the menu item): normal tap toggle plus the mana the SHOWING face
   *  yields — tapManaYield parses the face's own oracle text because
   *  Scryfall's produced_mana covers the whole card (both faces) and never
   *  carries amounts. Untapping (the same toggle the other way) never
   *  subtracts. */
  const tapForMana = useCallback(
    (card: CardView, def: CardDef | null) => {
      if (!card.tapped && def && self) {
        const gain = tapManaYield(
          faceOracleText(def, card.showBack),
          def.produced_mana
        );
        if (Object.values(gain).some((n) => (n ?? 0) > 0)) {
          commit(manaAfterTap(self.mana, gain));
        }
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
