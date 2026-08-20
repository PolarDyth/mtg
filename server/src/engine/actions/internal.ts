// Shared foundation for the action handlers: the registry types, the result
// constructors, cross-domain helpers, and the structural limits. Validation
// is structural + ownership only; the server never rejects an action for
// game-rule reasons.

import type { Action, CardInstance } from "@mythic/shared";
import type { Rng } from "../rng";
import {
  findCard,
  randomId,
  systemMessage,
  type Game,
  type Player,
} from "../state";

export type Ctx = { rng: Rng; now: () => number };

export type ActionResult =
  | { ok: true; game: Game }
  | { ok: false; error: string };

/** One action's handler. Handlers may omit trailing params they don't use. */
export type Handler<A extends Action = Action> = (
  game: Game,
  actor: Player,
  action: A,
  ctx: Ctx
) => ActionResult;

/**
 * Compile-time exhaustive registry: one entry per Action type, with each
 * handler's payload narrowed to its own action shape. A domain file exports
 * `satisfies Partial<HandlerMap>` (no annotation — that keeps its keys
 * required so the spread in index.ts fails to compile on any gap).
 */
export type HandlerMap = {
  [K in Action["type"]]: Handler<Extract<Action, { type: K }>>;
};

export const ALLOWED_DIE_SIDES: readonly number[] = [4, 6, 8, 10, 12, 20, 100];
export const MAX_DECK_ENTRIES = 250;
export const MAX_TOTAL_CARDS = 1000;
export const MAX_TOKENS_AT_ONCE = 20;
export const MAX_REVEAL_AT_ONCE = 30;
export const MAX_COUNTER_KINDS = 12;
export const MAX_ANNOTATIONS = 8;

export function err(error: string): ActionResult {
  return { ok: false, error };
}

export function ok(game: Game): ActionResult {
  return { ok: true, game };
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function requireStarted(game: Game): string | null {
  return game.started ? null : "game has not started";
}

/** Host gate for admin actions; `message` is the action-specific error. */
export function requireHost(game: Game, actor: Player, message: string): string | null {
  return game.hostId !== actor.id ? message : null;
}

/** Find a card and verify the actor owns it. */
export function ownCard(
  game: Game,
  actor: Player,
  uid: string
): { player: Player; card: CardInstance } | null {
  const found = findCard(game, uid);
  if (!found) return null;
  if (found.player.id !== actor.id) return null;
  return found;
}

export function removeFromZone(card: CardInstance, zones: Player["zones"]): void {
  for (const list of Object.values(zones)) {
    const i = list.indexOf(card);
    if (i !== -1) list.splice(i, 1);
  }
}

/** Detach anything attached to a card that leaves the battlefield. */
export function detachFollowers(game: Game, uid: string): void {
  for (const player of game.players) {
    for (const card of player.zones.battlefield) {
      if (card.attachedTo === uid) card.attachedTo = undefined;
    }
  }
}

export function newInstance(cardId: string, ctx: Ctx): CardInstance {
  return {
    uid: randomId(ctx.rng),
    cardId,
    x: 50,
    y: 50,
    tapped: false,
    faceDown: false,
    counters: {},
    annotations: [],
  };
}

/** Announce whose turn it is after a removal (removePlayer runs first). */
export function fixTurnAfterRemoval(game: Game, ctx: Ctx): void {
  if (game.activePlayerId && game.players.length > 0) {
    const next = game.players.find((p) => p.id === game.activePlayerId);
    if (next) systemMessage(game, `It is now ${next.name}'s turn`, ctx.rng, ctx.now());
  }
}

export function shuffle(list: CardInstance[], rng: Rng): void {
  for (let i = list.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
}
