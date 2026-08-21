/**
 * DOM hit-testing for the game table. Separate from the pure foundation.ts
 * because these read the live document.
 */

import type { PlayerId } from "@mythic/shared";

/** What arrow target sits under this viewport point: a battlefield card or
 *  a player's band header. Hand/pile cards never qualify. */
export function arrowTargetAt(
  x: number,
  y: number
): { uid: string } | { playerId: PlayerId } | null {
  const element = document.elementFromPoint(x, y);
  if (!element) return null;
  const card = element.closest<HTMLElement>("[data-card-uid]");
  if (card?.dataset.cardUid && card.closest("[data-drop='battlefield']")) {
    return { uid: card.dataset.cardUid };
  }
  const head = element.closest<HTMLElement>("[data-player-head]");
  if (head?.dataset.playerHead) return { playerId: head.dataset.playerHead };
  return null;
}
