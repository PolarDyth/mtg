// Battlefield card state: flags, counters, position, notes, attachments,
// and tokens.

import type { Action, CardInstance } from "@mythic/shared";
import { systemMessage, TOKEN_MARKER, type Game, type Player } from "../state";
import {
  clamp,
  err,
  MAX_ANNOTATIONS,
  MAX_COUNTER_KINDS,
  MAX_TOKENS_AT_ONCE,
  newInstance,
  ok,
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

function setPosition(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "SET_POSITION" }>
): ActionResult {
  const found = ownCard(game, actor, action.uid);
  if (!found) return err("card not found");
  found.card.x = clamp(action.x, 0, 100);
  found.card.y = clamp(action.y, 0, 100);
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
    found.card.attachedTo = undefined;
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

export const cardsHandlers = {
  SET_TAPPED: setTapped,
  SET_FACE_DOWN: setFaceDown,
  SET_COUNTERS: setCounters,
  SET_POSITION: setPosition,
  SET_NOTES: setNotes,
  ATTACH_CARD: attachCard,
  CREATE_TOKEN: createToken,
} satisfies Partial<HandlerMap>;
