/**
 * Pure helpers shared by the game-table feature modules: no DOM access, no
 * React — just lookups over the GameView snapshot and small policy math,
 * all unit-testable (foundation.test.ts). DOM hit-testing lives in
 * hitTest.ts; stateful features live in hooks/.
 */

import {
  ALL_PHASES,
  type Action,
  type CardView,
  type GameView,
  type Phase,
  type PlayerId,
  type Zone,
} from "@mythic/shared";
import type { CardDef } from "@/lib/scryfall";
import type { PickerMode } from "../CountPickerModal";

/** Creature detection is client-side on purpose — the server is card-id
 *  agnostic, so "which cards are creatures" is a display concern settled
 *  by type_line from the card-def cache. */
export function isCreature(
  card: CardView,
  get: (id: string | null) => CardDef | null
): boolean {
  return (
    card.cardId !== null &&
    (get(card.cardId)?.type_line ?? "").includes("Creature")
  );
}

/** Find a card among the viewer's own zones. */
export function findOwnCard(
  view: GameView,
  you: PlayerId | null,
  uid: string
): { card: CardView; zone: Zone } | null {
  const self = view.players.find((p) => p.id === you);
  if (!self) return null;
  for (const [zone, zoneView] of Object.entries(self.zones) as [Zone, typeof self.zones[Zone]][]) {
    if (zoneView.kind !== "cards") continue;
    const card = zoneView.cards.find((c) => c.uid === uid);
    if (card) return { card, zone };
  }
  return null;
}

/** Is this uid a battlefield card right now (any player's)? Arrow
 *  endpoints may be anyone's permanents. */
export function onAnyBattlefield(view: GameView, uid: string): boolean {
  return view.players.some(
    (p) =>
      p.zones.battlefield.kind === "cards" &&
      p.zones.battlefield.cards.some((c) => c.uid === uid)
  );
}

/** The hovered card resolved against the viewer's own zones — shortcut
 *  binds only ever act on your own cards. */
export function findOwnHovered(
  view: GameView,
  you: PlayerId | null,
  hoverCard: CardView | null
): { card: CardView; zone: Zone } | null {
  return hoverCard ? findOwnCard(view, you, hoverCard.uid) : null;
}

/** Ctrl+Enter / the strip's "Next ▸": advance one phase, or from the last
 *  phase pass the turn entirely. */
export function nextPhaseAction(phase: Phase): Action {
  const i = ALL_PHASES.indexOf(phase);
  return i >= 0 && i < ALL_PHASES.length - 1
    ? { type: "SET_PHASE", phase: ALL_PHASES[i + 1] }
    : { type: "NEXT_TURN" };
}

/** Upper bound for each count-picking mode. */
export function pickerMax(
  mode: PickerMode,
  libraryCount: number,
  handCount = 0
): number {
  switch (mode) {
    case "draw":
    case "mill":
      return 100;
    case "mulligan":
      return 99; // server clamps to the library size
    case "token":
    case "clone":
      return 20; // MAX_TOKENS_AT_ONCE; more via Ctrl+G repeat
    case "scry":
    case "surveil":
      return Math.min(10, libraryCount);
    case "lookTop":
      return libraryCount;
    case "revealTop":
      return Math.min(30, libraryCount);
    case "discardRandom":
      return Math.min(30, handCount); // MAX_DISCARD_AT_ONCE, capped by the hand
  }
}

/** Structural stand-in for the rects getBoundingClientRect returns — plain
 *  numbers so tests can pass literal objects. */
export type Rect = { left: number; top: number; width: number; height: number };

/** Drop position for a card dropped at viewport point (x, y) over the
 *  player's own board rect: percentages of that board (the owner's frame,
 *  un-mirrored), clamped so the card's center can't leave the board, and
 *  rounded to a tenth of a percent — or, with `snap`, to the 5% lattice
 *  (still inside the clamp: 4/96 → 5/95 on x, 8/92 → 10/90 on y). */
export function battlefieldDrop(
  rect: Rect,
  x: number,
  y: number,
  snap = false
): {
  x: number;
  y: number;
} {
  const px = ((x - rect.left) / rect.width) * 100;
  const py = ((y - rect.top) / rect.height) * 100;
  if (snap) {
    return {
      x: Math.round(Math.min(96, Math.max(4, px)) / 5) * 5,
      y: Math.round(Math.min(92, Math.max(8, py)) / 5) * 5,
    };
  }
  return {
    x: Math.round(Math.min(96, Math.max(4, px)) * 10) / 10,
    y: Math.round(Math.min(92, Math.max(8, py)) * 10) / 10,
  };
}
