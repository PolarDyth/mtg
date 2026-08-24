/**
 * Pure helpers shared by the game-table feature modules: no DOM access, no
 * React — just lookups over the GameView snapshot and small policy math,
 * all unit-testable (foundation.test.ts). DOM hit-testing lives in
 * hitTest.ts; stateful features live in hooks/.
 */

import {
  ALL_PHASES,
  MANA_COLORS,
  type Action,
  type CardView,
  type GameView,
  type ManaColor,
  type ManaPool,
  type Phase,
  type PlayerId,
  type Zone,
} from "@cardessa/shared";
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

/** Pile-viewer filter: case-insensitive substring over everything a player
 *  might remember about a card — name, type line, and rules text. An empty
 *  needle matches everything; a missing def (hidden card, unfetched id)
 *  matches nothing. */
export function cardMatchesText(def: CardDef | null, needle: string): boolean {
  const key = needle.trim().toLowerCase();
  if (!key) return true;
  if (!def) return false;
  return [def.name, def.type_line, def.oracle_text].some((text) =>
    text.toLowerCase().includes(key)
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
    case "putFromTop":
      return libraryCount + 1; // may sit below every current card
  }
}

/** The oracle text of the face that's showing: the back face's own text when
 *  transformed; for a DFC's front, the first segment of the joined
 *  "front // back" text toDef stores (splits and adventures have no back, so
 *  their combined text passes through untouched). Face-scoped because
 *  Scryfall's produced_mana covers the whole card, both faces included. */
export function faceOracleText(def: CardDef | null, showBack?: boolean): string {
  if (!def) return "";
  if (showBack && def.back) return def.back.oracle_text;
  if (def.back) return def.oracle_text.split(" // ")[0];
  return def.oracle_text;
}

/** The mana tapping this face banks, as far as its own oracle text can say
 *  (Scryfall's produced_mana carries colors, never amounts): a run of pool
 *  symbols right after "Add" counts per symbol — "{T}: Add {C}{C}" banks two
 *  colorless, "…Add {G}{U}" banks one of each; "mana of any color" banks a
 *  single pip of the first listed color (the pips stay the manual
 *  correction); any other text that clearly adds mana (Nykthos, "adds an
 *  additional") falls back to one of each DISTINCT listed color; a face
 *  whose text never adds mana banks nothing — that's what keeps a DFC's
 *  untransformed front from banking the back's mana. */
export function tapManaYield(
  oracleText: string,
  produced: string[]
): Partial<ManaPool> {
  const gain: Partial<ManaPool> = {};
  const run = /[Aa]dd ((?:\{[WUBRGC]\})+)/.exec(oracleText);
  if (run) {
    for (const symbol of run[1].matchAll(/\{([WUBRGC])\}/g)) {
      const color = symbol[1] as ManaColor;
      gain[color] = (gain[color] ?? 0) + 1;
    }
    return gain;
  }
  if (/mana of any (?:single )?(?:color|type)/.test(oracleText)) {
    const first = produced.find((s) =>
      (MANA_COLORS as readonly string[]).includes(s)
    );
    return { [(first as ManaColor) ?? "C"]: 1 };
  }
  if (/add/i.test(oracleText)) {
    for (const symbol of new Set(produced)) {
      if ((MANA_COLORS as readonly string[]).includes(symbol)) {
        gain[symbol as ManaColor] = 1;
      }
    }
  }
  return gain;
}

/** The tap convenience, amount-aware since the yield parser: adds tapMana's
 *  gain onto the pool, color by color, capped at 99. Only ever called on a
 *  tap-ON; untapping never touches the pool. */
export function manaAfterTap(pool: ManaPool, gain: Partial<ManaPool>): ManaPool {
  const next = { ...pool };
  for (const color of MANA_COLORS) {
    const amount = gain[color] ?? 0;
    if (amount > 0) next[color] = Math.min(99, next[color] + amount);
  }
  return next;
}

/** Pip-control math: remove `amount` of one color, floored at zero. */
export function manaAfterSpend(
  pool: ManaPool,
  color: ManaColor,
  amount: number
): ManaPool {
  return { ...pool, [color]: Math.max(0, pool[color] - amount) };
}

/** The def as it should render: a double-faced card showing its back uses
 *  the back face's identity (name, type, cost, art) over the shared def.
 *  One helper so every surface — table, zoom, pile viewer, drag ghost —
 *  agrees on which face is "the card" right now. */
export function faceDef(
  def: CardDef | null,
  showBack?: boolean
): CardDef | null {
  return showBack && def?.back ? { ...def, ...def.back } : def;
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
