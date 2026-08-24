// Battlefield card state: flags, counters, position, notes, attachments,
// tokens, and drawn arrows.

import type { Action, CardInstance } from "@mythic/shared";
import {
  findPlayer,
  randomId,
  systemMessage,
  TOKEN_MARKER,
  type Game,
  type Player,
} from "../state";
import {
  clamp,
  err,
  MAX_ANNOTATIONS,
  MAX_ARROWS,
  MAX_BATTLEFIELD_CARDS,
  MAX_COUNTER_KINDS,
  MAX_TOKENS_AT_ONCE,
  newInstance,
  ok,
  onBattlefield,
  ownCard,
  requireStarted,
  type ActionResult,
  type Ctx,
  type HandlerMap,
} from "./internal";

function setTapped(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "SET_TAPPED" }>
): ActionResult {
  const found = ownCard(game, actor, action.uid);
  if (!found) return err("card not found");
  found.card.tapped = action.value;
  return ok(game);
}

function setFaceDown(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "SET_FACE_DOWN" }>
): ActionResult {
  const found = ownCard(game, actor, action.uid);
  if (!found) return err("card not found");
  found.card.faceDown = action.value;
  return ok(game);
}

/** Toggle which face of a double-faced card shows. The client names the
 *  target face (the server never knows what a card is); everything else on
 *  the instance — counters, position, tapped, attachments — rides along. */
function transformCard(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "TRANSFORM_CARD" }>,
  ctx: Ctx
): ActionResult {
  const name = action.name?.trim() ?? "";
  if (name.length < 1 || name.length > 64) return err("bad transform name");
  const found = ownCard(game, actor, action.uid);
  if (!found) return err("card not found");
  found.card.showBack = !found.card.showBack;
  systemMessage(game, `${actor.name} transforms into ${name}`, ctx.rng, ctx.now());
  return ok(game);
}

function setPosition(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "SET_POSITION" }>
): ActionResult {
  const found = ownCard(game, actor, action.uid);
  if (!found) return err("card not found");
  found.card.x = clamp(action.x, 0, 100);
  found.card.y = clamp(action.y, 0, 100);
  // Moving a card by hand is an implicit detach — dragging a follower off
  // its host separates them (the explicit Detach menu item stays too).
  if (actor.zones.battlefield.includes(found.card)) {
    detachAndReorder(actor.zones.battlefield, found.card);
  } else {
    found.card.attachedTo = undefined;
  }
  return ok(game);
}

function setNotes(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "SET_NOTES" }>
): ActionResult {
  const found = ownCard(game, actor, action.uid);
  if (!found) return err("card not found");
  if (action.notes.length > MAX_ANNOTATIONS) return err("too many notes");
  const clean: string[] = [];
  for (const note of action.notes) {
    if (typeof note !== "string") return err("bad notes");
    const trimmed = note.trim().slice(0, 100);
    if (trimmed) clean.push(trimmed);
  }
  found.card.annotations = [
    ...found.card.annotations.filter((a) => a.startsWith(TOKEN_MARKER)),
    ...clean,
  ];
  return ok(game);
}

function setCounters(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "SET_COUNTERS" }>
): ActionResult {
  const found = ownCard(game, actor, action.uid);
  if (!found) return err("card not found");
  const keys = Object.keys(action.counters);
  if (keys.length > MAX_COUNTER_KINDS) return err("too many counter kinds");
  const clean: Record<string, number> = {};
  for (const key of keys) {
    const value = action.counters[key];
    if (
      key.length === 0 ||
      key.length > 20 ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 999
    ) {
      return err("bad counters");
    }
    if (value > 0) clean[key] = value;
  }
  found.card.counters = clean;
  return ok(game);
}

/** Loose cards paint freshest-on-top: a card that stops being an attachment
 *  rejoins the end of the battlefield order. */
function detachAndReorder(battlefield: CardInstance[], card: CardInstance): void {
  card.attachedTo = undefined;
  battlefield.splice(battlefield.indexOf(card), 1);
  battlefield.push(card);
}

function attachCard(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "ATTACH_CARD" }>
): ActionResult {
  const found = ownCard(game, actor, action.uid);
  if (!found) return err("card not found");
  if (!actor.zones.battlefield.includes(found.card)) {
    return err("card is not on the battlefield");
  }
  if (action.to === null) {
    detachAndReorder(actor.zones.battlefield, found.card);
    return ok(game);
  }
  if (action.to === found.card.uid) return err("cannot attach to itself");
  const host = actor.zones.battlefield.find((c) => c.uid === action.to);
  if (!host) return err("host card not found");

  // Walk the attachment chain to reject cycles.
  let cursor: CardInstance | undefined = host;
  while (cursor) {
    if (cursor.attachedTo === found.card.uid) return err("attachment cycle");
    cursor = actor.zones.battlefield.find((c) => c.uid === cursor?.attachedTo);
  }
  found.card.attachedTo = host.uid;
  // The newest attachment tucks in BEHIND the stack: the battlefield array
  // is the stack's source of truth, so the fresh card is placed before the
  // host's existing followers — it gets the innermost cascade slot (painted
  // first, smallest offset) and the older ones stay on top.
  const battlefield = actor.zones.battlefield;
  battlefield.splice(battlefield.indexOf(found.card), 1);
  const followers = battlefield.filter((c) => c.attachedTo === host.uid);
  battlefield.splice(battlefield.indexOf(followers[0] ?? host), 0, found.card);
  return ok(game);
}

function createToken(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "CREATE_TOKEN" }>,
  ctx: Ctx
): ActionResult {
  const started = requireStarted(game);
  if (started) return err(started);
  const name = action.name?.trim() ?? "";
  if (name.length < 1 || name.length > 64) return err("bad token name");
  if (
    !Number.isInteger(action.count) ||
    action.count < 1 ||
    action.count > MAX_TOKENS_AT_ONCE
  ) {
    return err(`bad token count (max ${MAX_TOKENS_AT_ONCE})`);
  }
  if (action.cardId !== undefined && (action.cardId.length === 0 || action.cardId.length > 64)) {
    return err("bad token card id");
  }
  // Tokens share the battlefield cap so repeated creation can't grow the
  // zone (and every broadcast) without bound.
  if (actor.zones.battlefield.length + action.count > MAX_BATTLEFIELD_CARDS) {
    return err("battlefield is full — too many cards");
  }

  // Default position: spread across the middle of the owner's battlefield
  // band (positions are band-relative percentages).
  const start = actor.zones.battlefield.length;
  for (let i = 0; i < action.count; i++) {
    const token = newInstance(action.cardId ?? "", ctx);
    token.cardId = action.cardId ?? "";
    token.annotations = [`${TOKEN_MARKER}${name}`];
    token.x = 8 + ((start + i) % 11) * 7.6;
    token.y = 35 + Math.floor((start + i) / 11) * 25;
    actor.zones.battlefield.push(token);
  }
  systemMessage(
    game,
    `${actor.name} created ${action.count > 1 ? `${action.count}× ` : ""}${name}`,
    ctx.rng,
    ctx.now()
  );
  return ok(game);
}

function drawArrow(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "DRAW_ARROW" }>,
  ctx: Ctx
): ActionResult {
  if (!onBattlefield(game, action.fromUid)) {
    return err("source card is not on the battlefield");
  }
  if ("uid" in action.to) {
    if (action.to.uid === action.fromUid) {
      return err("cannot point an arrow at its own card");
    }
    if (!onBattlefield(game, action.to.uid)) {
      return err("target card is not on the battlefield");
    }
  } else if (!findPlayer(game, action.to.playerId)) {
    return err("target player not found");
  }
  // One outgoing arrow per card per author — redrawing replaces, so
  // re-declaring an attack never stacks duplicates.
  const replaces = game.arrows.some(
    (a) => a.playerId === actor.id && a.fromUid === action.fromUid
  );
  if (!replaces && game.arrows.length >= MAX_ARROWS) {
    return err("too many arrows on the table");
  }
  game.arrows = game.arrows.filter(
    (a) => !(a.playerId === actor.id && a.fromUid === action.fromUid)
  );
  game.arrows.push({
    id: randomId(ctx.rng),
    playerId: actor.id,
    fromUid: action.fromUid,
    to: action.to,
    at: ctx.now(),
  });
  return ok(game);
}

function clearArrows(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "CLEAR_ARROWS" }>
): ActionResult {
  if (action.id !== undefined) {
    const before = game.arrows.length;
    game.arrows = game.arrows.filter((a) => a.id !== action.id);
    if (game.arrows.length === before) return err("arrow not found");
    return ok(game);
  }
  if (action.playerId !== undefined) {
    game.arrows = game.arrows.filter((a) => a.playerId !== action.playerId);
    return ok(game);
  }
  game.arrows = [];
  return ok(game);
}

export const cardsHandlers = {
  SET_TAPPED: setTapped,
  SET_FACE_DOWN: setFaceDown,
  TRANSFORM_CARD: transformCard,
  SET_COUNTERS: setCounters,
  SET_POSITION: setPosition,
  SET_NOTES: setNotes,
  ATTACH_CARD: attachCard,
  CREATE_TOKEN: createToken,
  DRAW_ARROW: drawArrow,
  CLEAR_ARROWS: clearArrows,
} satisfies Partial<HandlerMap>;
