// Shared harness for the per-domain action tests.

import { expect } from "vitest";
import type { Action, CardInstance } from "@cardessa/shared";
import { seededRng } from "../rng";
import { addPlayer, createGame, makePlayer, type Game, type Player } from "../state";
import { applyAction, type Ctx } from "./index";

export function setup(): { game: Game; ctx: Ctx; ada: Player; bob: Player } {
  const game = createGame("TEST-0001");
  const ctx: Ctx = { rng: seededRng(42), now: () => 1_000 };
  const ada = makePlayer(game, "Ada", "tok-ada", ctx.rng);
  const bob = makePlayer(game, "Bob", "tok-bob", ctx.rng);
  addPlayer(game, ada);
  addPlayer(game, bob);
  return { game, ctx, ada, bob };
}

/** Load a deck of `n` distinct cards for a player and start the game. */
export function startWithDeck(
  game: Game,
  ctx: Ctx,
  player: Player,
  n = 40
): void {
  const r = applyAction(
    game,
    {
      type: "LOAD_DECK",
      library: Array.from({ length: n }, (_, i) => ({ cardId: `card-${i}`, count: 1 })),
      sideboard: [{ cardId: `side-0`, count: 15 }],
    },
    player.id,
    ctx
  );
  expect(r.ok).toBe(true);
  const r2 = applyAction(game, { type: "START_GAME" }, player.id, ctx);
  expect(r2.ok).toBe(true);
}

export function act(game: Game, ctx: Ctx, player: Player, action: Action) {
  return applyAction(game, action, player.id, ctx);
}

export function mustOk(result: ReturnType<typeof applyAction>) {
  expect(result.ok).toBe(true);
}

export function mustFail(result: ReturnType<typeof applyAction>, fragment: string) {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toContain(fragment);
}

export function uidAt(zone: CardInstance[], index: number): string {
  const card = zone[index];
  if (!card) throw new Error(`no card at index ${index}`);
  return card.uid;
}
