// Game flow: starting the game, turn order, life totals, leaving.

import type { Action, Format } from "@mythic/shared";
import {
  removePlayer,
  systemMessage,
  type Game,
  type Player,
} from "../state";
import {
  err,
  fixTurnAfterRemoval,
  ok,
  requireStarted,
  type ActionResult,
  type Ctx,
  type HandlerMap,
} from "./internal";

function startGame(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "START_GAME" }>,
  ctx: Ctx
): ActionResult {
  if (game.started) return err("game already started");
  if (game.players.length === 0) return err("no players");
  const format: Format =
    action.format === "commander" ? "commander" : "freeform";
  game.format = format;
  if (format === "commander") {
    for (const player of game.players) player.life = 40;
  }
  game.started = true;
  game.activePlayerId = game.players[0].id;
  systemMessage(
    game,
    format === "commander"
      ? `${actor.name} started a Commander game — everyone starts at 40 life`
      : `${actor.name} started the game`,
    ctx.rng,
    ctx.now()
  );
  return ok(game);
}

function setLife(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "SET_LIFE" }>
): ActionResult {
  if (!Number.isInteger(action.life) || action.life < -99 || action.life > 99999) {
    return err("bad life total");
  }
  actor.life = action.life;
  return ok(game);
}

function nextTurn(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "NEXT_TURN" }>,
  ctx: Ctx
): ActionResult {
  const started = requireStarted(game);
  if (started) return err(started);
  const i = game.players.findIndex((p) => p.id === game.activePlayerId);
  const next = game.players[(i + 1 + game.players.length) % game.players.length];
  game.activePlayerId = next.id;
  systemMessage(game, `It is now ${next.name}'s turn`, ctx.rng, ctx.now());
  return ok(game);
}

function leaveGame(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "LEAVE_GAME" }>,
  ctx: Ctx
): ActionResult {
  removePlayer(game, actor.id);
  fixTurnAfterRemoval(game, ctx);
  systemMessage(game, `${actor.name} left the game`, ctx.rng, ctx.now());
  return ok(game);
}

export const gameHandlers = {
  START_GAME: startGame,
  NEXT_TURN: nextTurn,
  SET_LIFE: setLife,
  LEAVE_GAME: leaveGame,
} satisfies Partial<HandlerMap>;
