// Game flow: starting the game, turn order, life totals, mana pools, leaving.

import { ALL_PHASES, MANA_COLORS, emptyMana, type Action, type Format } from "@mythic/shared";
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
  shuffle,
  type ActionResult,
  type Ctx,
  type HandlerMap,
} from "./internal";

/** Draw `min(count, library.length)` cards from the top into the hand. */
function drawFromTop(player: Player, count: number): number {
  const drawn = Math.min(count, player.zones.library.length);
  for (let i = 0; i < drawn; i++) {
    const card = player.zones.library.shift();
    if (card) player.zones.hand.push(card);
  }
  return drawn;
}

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
  game.phase = "untap";
  game.turnNumber = 1;
  game.startedAt = ctx.now();
  game.activePlayerId = game.players[0].id;
  systemMessage(
    game,
    format === "commander"
      ? `${actor.name} started a Commander game — everyone starts at 40 life`
      : `${actor.name} started the game`,
    ctx.rng,
    ctx.now()
  );
  // Opening hands for everyone who loaded a deck (deterministic top-of-
  // library splice). Deckless players and mid-game loads draw manually.
  let drewAny = false;
  for (const player of game.players) {
    if (drawFromTop(player, 7) > 0) drewAny = true;
  }
  if (drewAny) {
    systemMessage(game, "Opening hands drawn", ctx.rng, ctx.now());
  }
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

/** Whole-record mana commit, SET_LIFE-style: structural validation only.
 *  Missing colors default to zero; nothing here ever drains a pool — the
 *  server syncs bookkeeping, it doesn't judge phases. */
function setMana(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "SET_MANA" }>
): ActionResult {
  for (const [color, amount] of Object.entries(action.mana)) {
    if (!MANA_COLORS.includes(color as (typeof MANA_COLORS)[number])) {
      return err("bad mana color");
    }
    if (!Number.isInteger(amount) || amount < 0 || amount > 99) {
      return err("bad mana amount");
    }
  }
  actor.mana = { ...emptyMana(), ...action.mana };
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
  game.phase = "untap";
  game.turnNumber += 1;
  // Passing the turn ends combat talk — attack/block arrows go with it.
  game.arrows = [];
  // Convenience, deliberately dumb: the incoming player's whole board
  // untaps. Cards that "shouldn't" untap just get re-tapped by hand —
  // the server syncs state, it never judges.
  for (const card of next.zones.battlefield) card.tapped = false;
  systemMessage(game, `It is now ${next.name}'s turn`, ctx.rng, ctx.now());
  return ok(game);
}

function setPhase(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "SET_PHASE" }>
): ActionResult {
  const started = requireStarted(game);
  if (started) return err(started);
  // Purely structural: any seated player may move the label anywhere —
  // like NEXT_TURN, there is no active-player gating.
  if (!ALL_PHASES.includes(action.phase)) return err("unknown phase");
  game.phase = action.phase;
  return ok(game);
}

function mulligan(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "MULLIGAN" }>,
  ctx: Ctx
): ActionResult {
  const started = requireStarted(game);
  if (started) return err(started);
  if (!Number.isInteger(action.draw) || action.draw < 0 || action.draw > 99) {
    return err("bad mulligan size");
  }
  // The whole hand goes back, the library shuffles, then a fresh hand of
  // the chosen size is dealt (player picks the size, not "one less").
  actor.zones.library.push(...actor.zones.hand);
  actor.zones.hand.length = 0;
  shuffle(actor.zones.library, ctx.rng);
  const drawn = drawFromTop(actor, action.draw);
  systemMessage(
    game,
    `${actor.name} takes a mulligan to ${drawn}`,
    ctx.rng,
    ctx.now()
  );
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
  SET_PHASE: setPhase,
  SET_LIFE: setLife,
  SET_MANA: setMana,
  MULLIGAN: mulligan,
  LEAVE_GAME: leaveGame,
} satisfies Partial<HandlerMap>;
