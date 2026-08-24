"use client";

/**
 * Auto-clear preference (mtg:auto-clear-mana): when on, the client commits an
 * empty pool for itself the moment the shared phase or turn advances — paper
 * MTG drains mana at every step. Purely client-side bookkeeping on top of
 * SET_MANA: the engine never drains pools by contract, opponents' pools are
 * untouched, and the setting persists like grid snapping.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptyMana,
  type Action,
  type GameView,
  type PlayerId,
  type PlayerView,
} from "@cardessa/shared";
import { loadAutoClearMana, saveAutoClearMana } from "@/lib/settings";

export function useAutoClearMana({
  view,
  self,
  send,
}: {
  view: GameView;
  self: PlayerView | null;
  send: (action: Action) => void;
}) {
  const [autoClear, setAutoClearState] = useState(loadAutoClearMana);

  useEffect(() => {
    saveAutoClearMana(autoClear);
  }, [autoClear]);

  // The previous turn/phase marker, tracked on EVERY snapshot (even while
  // the preference is off) so enabling it mid-turn never fires a spurious
  // clear, and the initial snapshot (prev null) never fires either.
  const prevRef = useRef<{
    phase: GameView["phase"];
    turnNumber: number;
    activePlayerId: PlayerId;
  } | null>(null);

  useEffect(() => {
    const cur = {
      phase: view.phase,
      turnNumber: view.turnNumber,
      activePlayerId: view.activePlayerId,
    };
    const prev = prevRef.current;
    prevRef.current = cur;
    if (!autoClear || !self || !prev) return;
    if (
      prev.phase === cur.phase &&
      prev.turnNumber === cur.turnNumber &&
      prev.activePlayerId === cur.activePlayerId
    ) {
      return;
    }
    // Only send when something would actually drain — SET_MANA is
    // chat-silent but still rebroadcasts a snapshot to every viewer.
    if (Object.values(self.mana).some((n) => n > 0)) {
      send({ type: "SET_MANA", mana: emptyMana() });
    }
  }, [view.phase, view.turnNumber, view.activePlayerId, autoClear, self, send]);

  const setAutoClear = useCallback((value: boolean) => setAutoClearState(value), []);

  return { autoClear, setAutoClear };
}
