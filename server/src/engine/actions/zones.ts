// Card flow between zones: drawing, moving, reordering, shuffling.

import type { Action, CardInstance } from "@mythic/shared";
import { systemMessage, type Game, type Player } from "../state";
import {
  detachFollowers,
  err,
  isToken,
  MAX_DISCARD_AT_ONCE,
  MAX_LOOK,
  ok,
  ownCard,
  removeFromZone,
  requireStarted,
  shuffle,
  takeTopPartition,
  tokenLabel,
  zoneOf,
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
  if (drawn > 0) {
    systemMessage(game, `${actor.name} draws ${drawn} ${drawn === 1 ? "card" : "cards"}`, ctx.rng, ctx.now());
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

  let index: number;
  if (action.index === "top") index = 0;
  else if (action.index === "bottom") index = target.length;
  else if (action.index !== undefined) {
    if (!Number.isInteger(action.index) || action.index < 0) {
      return err("bad index");
    }
    index = Math.min(action.index, target.length);
  } else {
    // Default placement: top of library, end of everything else.
    index = action.to === "library" ? 0 : target.length;
  }

  // A token heading anywhere but the battlefield ceases to exist — how a
  // physical table clears bounced or milled tokens. (Arrows pointing at it
  // are pruned automatically after the action.)
  if (action.to !== "battlefield" && isToken(found.card)) {
    detachFollowers(game, found.card.uid);
    removeFromZone(found.card, actor.zones);
    systemMessage(
      game,
      `${actor.name}'s ${tokenLabel(found.card)} ceases to exist`,
      ctx.rng,
      ctx.now()
    );
    return ok(game);
  }

  const wasOnBattlefield = actor.zones.battlefield.includes(found.card);
  const from = zoneOf(actor.zones, found.card);
  detachFollowers(game, found.card.uid);
  removeFromZone(found.card, actor.zones);
  target.splice(index, 0, found.card);

  if (action.to !== "battlefield" || !wasOnBattlefield) {
    found.card.attachedTo = undefined;
  }
  if (from && from !== action.to) {
    const dest =
      action.to === "library"
        ? index === 0
          ? "the top of their library"
          : index === target.length - 1
            ? "the bottom of their library"
            : "their library"
        : action.to;
    systemMessage(game, `${actor.name} moves a card from ${from} to ${dest}`, ctx.rng, ctx.now());
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

function discardCards(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "DISCARD_CARDS" }>,
  ctx: Ctx
): ActionResult {
  const started = requireStarted(game);
  if (started) return err(started);
  if (
    !Array.isArray(action.uids) ||
    action.uids.length < 1 ||
    action.uids.length > MAX_DISCARD_AT_ONCE
  ) {
    return err("bad discard");
  }
  if (new Set(action.uids).size !== action.uids.length) return err("duplicate card");
  const cards: CardInstance[] = [];
  for (const uid of action.uids) {
    const found = ownCard(game, actor, uid);
    if (!found || !actor.zones.hand.includes(found.card)) {
      return err("card not in hand");
    }
    cards.push(found.card);
  }
  for (const card of cards) {
    actor.zones.hand.splice(actor.zones.hand.indexOf(card), 1);
    // Tokens never reach other zones — they cease to exist instead.
    if (isToken(card)) {
      systemMessage(
        game,
        `${actor.name}'s ${tokenLabel(card)} ceases to exist`,
        ctx.rng,
        ctx.now()
      );
      continue;
    }
    card.attachedTo = undefined;
    actor.zones.graveyard.push(card);
  }
  systemMessage(
    game,
    `${actor.name} discards ${cards.length} ${cards.length === 1 ? "card" : "cards"}`,
    ctx.rng,
    ctx.now()
  );
  return ok(game);
}

/** Randomness must be server-side (ctx.rng) for the table to trust it: a
 *  partial Fisher–Yates swap picks `count` distinct cards, which then leave
 *  the front of the hand. The graveyard is public, so what was lost is
 *  visible to everyone right after. */
function discardRandom(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "DISCARD_RANDOM" }>,
  ctx: Ctx
): ActionResult {
  const started = requireStarted(game);
  if (started) return err(started);
  if (
    !Number.isInteger(action.count) ||
    action.count < 1 ||
    action.count > MAX_DISCARD_AT_ONCE
  ) {
    return err("bad discard count");
  }
  const hand = actor.zones.hand;
  const count = Math.min(action.count, hand.length);
  for (let i = 0; i < count; i++) {
    const j = i + ctx.rng.int(hand.length - i);
    [hand[i], hand[j]] = [hand[j], hand[i]];
  }
  const picked = hand.splice(0, count);
  for (const card of picked) {
    if (isToken(card)) {
      systemMessage(
        game,
        `${actor.name}'s ${tokenLabel(card)} ceases to exist`,
        ctx.rng,
        ctx.now()
      );
      continue;
    }
    card.attachedTo = undefined;
    actor.zones.graveyard.push(card);
  }
  if (picked.length > 0) {
    systemMessage(
      game,
      `${actor.name} discards ${picked.length} ${picked.length === 1 ? "card" : "cards"} at random`,
      ctx.rng,
      ctx.now()
    );
  }
  return ok(game);
}

function millCards(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "MILL_CARDS" }>,
  ctx: Ctx
): ActionResult {
  const started = requireStarted(game);
  if (started) return err(started);
  if (!Number.isInteger(action.count) || action.count < 1 || action.count > 100) {
    return err("bad mill count");
  }
  const milled = Math.min(action.count, actor.zones.library.length);
  for (let i = 0; i < milled; i++) {
    const card = actor.zones.library.shift();
    if (!card) continue;
    if (isToken(card)) {
      systemMessage(
        game,
        `${actor.name}'s ${tokenLabel(card)} ceases to exist`,
        ctx.rng,
        ctx.now()
      );
      continue;
    }
    actor.zones.graveyard.push(card);
  }
  systemMessage(
    game,
    `${actor.name} mills ${milled} ${milled === 1 ? "card" : "cards"}`,
    ctx.rng,
    ctx.now()
  );
  return ok(game);
}

function scry(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "SCRY" }>,
  ctx: Ctx
): ActionResult {
  const started = requireStarted(game);
  if (started) return err(started);
  if (!Number.isInteger(action.look) || action.look < 1 || action.look > MAX_LOOK) {
    return err("bad scry count");
  }
  const part = takeTopPartition(actor.zones.library, action.look, action.top, action.bottom);
  if (!part.ok) return err(part.error);
  const byUid = new Map(part.cards.map((c) => [c.uid, c]));
  const topCards = action.top
    .map((uid) => byUid.get(uid))
    .filter((c): c is CardInstance => c !== undefined);
  actor.zones.library.unshift(...topCards);
  for (const uid of action.bottom) {
    const card = byUid.get(uid);
    if (card) actor.zones.library.push(card);
  }
  systemMessage(
    game,
    `${actor.name} scries ${action.look} (${action.top.length} on top, ${action.bottom.length} on bottom)`,
    ctx.rng,
    ctx.now()
  );
  return ok(game);
}

function surveil(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "SURVEIL" }>,
  ctx: Ctx
): ActionResult {
  const started = requireStarted(game);
  if (started) return err(started);
  if (!Number.isInteger(action.look) || action.look < 1 || action.look > MAX_LOOK) {
    return err("bad surveil count");
  }
  const part = takeTopPartition(actor.zones.library, action.look, action.top, action.graveyard);
  if (!part.ok) return err(part.error);
  const byUid = new Map(part.cards.map((c) => [c.uid, c]));
  const topCards = action.top
    .map((uid) => byUid.get(uid))
    .filter((c): c is CardInstance => c !== undefined);
  actor.zones.library.unshift(...topCards);
  for (const uid of action.graveyard) {
    const card = byUid.get(uid);
    if (!card) continue;
    if (isToken(card)) {
      systemMessage(
        game,
        `${actor.name}'s ${tokenLabel(card)} ceases to exist`,
        ctx.rng,
        ctx.now()
      );
      continue;
    }
    card.attachedTo = undefined;
    actor.zones.graveyard.push(card);
  }
  systemMessage(
    game,
    `${actor.name} surveils ${action.look} (${action.top.length} on top, ${action.graveyard.length} to graveyard)`,
    ctx.rng,
    ctx.now()
  );
  return ok(game);
}

export const zonesHandlers = {
  DRAW_CARDS: drawCards,
  MOVE_CARD: moveCard,
  MOVE_CARD_INDEX: moveCardIndex,
  SHUFFLE_LIBRARY: shuffleLibrary,
  DISCARD_CARDS: discardCards,
  DISCARD_RANDOM: discardRandom,
  MILL_CARDS: millCards,
  SCRY: scry,
  SURVEIL: surveil,
} satisfies Partial<HandlerMap>;
