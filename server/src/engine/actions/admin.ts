// Host powers: ending the game, removing players, banning players.

import type { Action } from "@mythic/shared";
import {
  emptyZones,
  findPlayer,
  removePlayer,
  systemMessage,
  type Game,
  type Player,
} from "../state";
import {
  err,
  fixTurnAfterRemoval,
  ok,
  requireHost,
  type ActionResult,
  type Ctx,
  type HandlerMap,
} from "./internal";

/** Host only: back to the lobby with the table cleared for a fresh game. */
function endGame(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "END_GAME" }>,
  ctx: Ctx
): ActionResult {
  const host = requireHost(game, actor, "only the host can end the game");
  if (host) return err(host);
  if (!game.started) return err("game has not started");
  game.started = false;
  game.format = "freeform";
  game.phase = "untap";
  game.turnNumber = 0;
  game.startedAt = null;
  game.activePlayerId = null;
  game.arrows = [];
  for (const player of game.players) {
    player.zones = emptyZones();
    player.life = 20;
    player.hasDeck = false;
  }
  systemMessage(
    game,
    `${actor.name} ended the game — back to the waiting room, load decks for the next one`,
    ctx.rng,
    ctx.now()
  );
  return ok(game);
}

/** Host only: remove a player and everything they own from the game. */
function kickPlayer(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "KICK_PLAYER" }>,
  ctx: Ctx
): ActionResult {
  const host = requireHost(game, actor, "only the host can remove players");
  if (host) return err(host);
  if (action.playerId === actor.id) return err("leave the game instead of removing yourself");
  const target = findPlayer(game, action.playerId);
  if (!target) return err("player not found");
  removePlayer(game, target.id);
  fixTurnAfterRemoval(game, ctx);
  systemMessage(game, `${actor.name} removed ${target.name} from the game`, ctx.rng, ctx.now());
  return ok(game);
}

/** Host only: remove a player and bar them (name + IP) from rejoining. */
function banPlayer(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "BAN_PLAYER" }>,
  ctx: Ctx
): ActionResult {
  const host = requireHost(game, actor, "only the host can ban players");
  if (host) return err(host);
  if (action.playerId === actor.id) return err("leave the game instead of banning yourself");
  const target = findPlayer(game, action.playerId);
  if (!target) return err("player not found");
  removePlayer(game, target.id);
  fixTurnAfterRemoval(game, ctx);
  game.banned.names.push(target.name.toLowerCase());
  if (target.ip && !game.banned.ips.includes(target.ip)) {
    game.banned.ips.push(target.ip);
  }
  systemMessage(game, `${actor.name} banned ${target.name} from the table`, ctx.rng, ctx.now());
  return ok(game);
}

/** Is this name/IP on the room's ban list? */
export function isBanned(game: Game, name: string, ip?: string): boolean {
  if (game.banned.names.includes(name.trim().toLowerCase())) return true;
  if (ip && game.banned.ips.includes(ip)) return true;
  return false;
}

export const adminHandlers = {
  END_GAME: endGame,
  KICK_PLAYER: kickPlayer,
  BAN_PLAYER: banPlayer,
} satisfies Partial<HandlerMap>;
