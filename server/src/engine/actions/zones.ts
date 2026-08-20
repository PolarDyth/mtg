// Card flow between zones: drawing, moving, reordering, shuffling.

import type { Action } from "@mythic/shared";
import { systemMessage, type Game, type Player } from "../state";
import {
  detachFollowers,
  err,
  ok,
  ownCard,
  removeFromZone,
  requireStarted,
  shuffle,
  type ActionResult,
  type Ctx,
  type HandlerMap,
} from "./internal";

function drawCards(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "DRAW_CARDS" }>,
  ctx: Ctx
): ActionResult {
  const started = requireStarted(game);
  if (started) return err(started);
  if (!Number.isInteger(action.count) || action.count < 1 || action.count > 100) {
    return err("bad draw count");
  }
  const drawn = Math.min(action.count, actor.zones.library.length);
  for (let i = 0; i < drawn; i++) {
    const card = actor.zones.library.shift();
    if (card) actor.zones.hand.push(card);
  }
  return ok(game);
}

function moveCard(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "MOVE_CARD" }>,
  ctx: Ctx
): ActionResult {
  const started = requireStarted(game);
  if (started) return err(started);
  const found = ownCard(game, actor, action.uid);
  if (!found) return err("card not found");
  const target = actor.zones[action.to];
  if (!target) return err("unknown zone");
  if (action.index !== undefined && (!Number.isInteger(action.index) || action.index < 0)) {
    return err("bad index");
  }

  const wasOnBattlefield = actor.zones.battlefield.includes(found.card);
  detachFollowers(game, found.card.uid);
  removeFromZone(found.card, actor.zones);

  // Default placement: top of library, end of everything else.
  const index =
    action.index !== undefined
      ? Math.min(action.index, target.length)
      : action.to === "library"
        ? 0
        : target.length;
  target.splice(index, 0, found.card);

  if (action.to !== "battlefield" || !wasOnBattlefield) {
    found.card.attachedTo = undefined;
  }
  return ok(game);
}

function moveCardIndex(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "MOVE_CARD_INDEX" }>
): ActionResult {
  const started = requireStarted(game);
  if (started) return err(started);
  const found = ownCard(game, actor, action.uid);
  if (!found) return err("card not found");
  if (!Number.isInteger(action.index) || action.index < 0) {
    return err("bad index");
  }
  // The card lives in exactly one of the actor's zones; find and reorder it.
  for (const list of Object.values(actor.zones)) {
    const i = list.indexOf(found.card);
    if (i !== -1) {
      list.splice(i, 1);
      list.splice(Math.min(action.index, list.length), 0, found.card);
      return ok(game);
    }
  }
  return err("card not found");
}

function shuffleLibrary(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "SHUFFLE_LIBRARY" }>,
  ctx: Ctx
): ActionResult {
  shuffle(actor.zones.library, ctx.rng);
  systemMessage(game, `${actor.name} shuffled their library`, ctx.rng, ctx.now());
  return ok(game);
}

export const zonesHandlers = {
  DRAW_CARDS: drawCards,
  MOVE_CARD: moveCard,
  MOVE_CARD_INDEX: moveCardIndex,
  SHUFFLE_LIBRARY: shuffleLibrary,
} satisfies Partial<HandlerMap>;
