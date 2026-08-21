"use client";

/**
 * Keeps CardDefs flowing for every card visible in the current snapshot:
 * your zones, opponents' public zones, and anything revealed in chat.
 * (Wraps the generic lib/useCardDefs with the table's id-collection rule.)
 */

import { useMemo } from "react";
import type { GameView, PlayerId, Zone } from "@mythic/shared";
import { useCardDefs } from "@/lib/useCardDefs";

export function useTableCards(view: GameView, you: PlayerId | null) {
  const cardIds = useMemo(() => {
    const ids = new Set<string>();
    for (const player of view.players) {
      for (const [zone, zoneView] of Object.entries(player.zones) as [
        Zone,
        typeof player.zones[Zone],
      ][]) {
        if (zoneView.kind !== "cards") continue;
        const own = player.id === you;
        if (!own && !["battlefield", "graveyard", "exile", "command"].includes(zone)) {
          continue;
        }
        for (const card of zoneView.cards) {
          if (card.cardId) ids.add(card.cardId);
        }
      }
    }
    for (const message of view.chat) {
      if (message.kind === "reveal") {
        for (const card of message.cards) ids.add(card.cardId);
      }
    }
    return ids;
  }, [view, you]);
  return useCardDefs(cardIds);
}
