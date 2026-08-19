// The action reducer: applies a client action to a game, mutating it in
// place. Pure with respect to IO — randomness and time arrive via Ctx so
// tests are deterministic. Validation is structural + ownership only; the
// server never rejects an action for game-rule reasons.

import {
  CHAT_CAP,
  type Action,
  type CardInstance,
  type ChatMessage,
  type Format,
  type PlayerId,
} from "@mythic/shared";
import {
  chatId,
  emptyZones,
  findCard,
  findPlayer,
  pushChat,
  randomId,
  removePlayer,
  systemMessage,
  TOKEN_MARKER,
  type Game,
  type Player,
} from "./state";
import type { Rng } from "./rng";

export type Ctx = { rng: Rng; now: () => number };

export type ActionResult =
  | { ok: true; game: Game }
  | { ok: false; error: string };

const ALLOWED_DIE_SIDES: readonly number[] = [4, 6, 8, 10, 12, 20, 100];
const MAX_DECK_ENTRIES = 250;
const MAX_TOTAL_CARDS = 1000;
const MAX_TOKENS_AT_ONCE = 20;
const MAX_REVEAL_AT_ONCE = 30;
const MAX_COUNTER_KINDS = 12;
const MAX_ANNOTATIONS = 8;

export function applyAction(
  game: Game,
  action: Action,
  actorId: PlayerId,
  ctx: Ctx
): ActionResult {
  const actor = findPlayer(game, actorId);
  if (!actor) return err("you are not seated in this game");

  switch (action.type) {
    case "LOAD_DECK":
      return loadDeck(game, actor, action, ctx);
    case "START_GAME":
      return startGame(game, actor, action, ctx);
    case "SET_COMMANDER":
      return setCommander(game, actor, action, ctx);
    case "DRAW_CARDS":
      return drawCards(game, actor, action, ctx);
    case "MOVE_CARD":
      return moveCard(game, actor, action, ctx);
    case "MOVE_CARD_INDEX":
      return moveCardIndex(game, actor, action);
    case "SET_TAPPED":
    case "SET_FACE_DOWN": {
      const found = ownCard(game, actor, action.uid);
      if (!found) return err("card not found");
      found.card[action.type === "SET_TAPPED" ? "tapped" : "faceDown"] = action.value;
      return ok(game);
    }
    case "SET_COUNTERS":
      return setCounters(game, actor, action);
    case "SET_POSITION": {
      const found = ownCard(game, actor, action.uid);
      if (!found) return err("card not found");
      found.card.x = clamp(action.x, 0, 100);
      found.card.y = clamp(action.y, 0, 100);
      return ok(game);
    }
    case "SET_NOTES": {
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
    case "ATTACH_CARD":
      return attachCard(game, actor, action);
    case "CREATE_TOKEN":
      return createToken(game, actor, action, ctx);
    case "REVEAL_CARDS":
      return revealCards(game, actor, action, ctx);
    case "SHUFFLE_LIBRARY":
      return shuffleLibrary(game, actor, ctx);
    case "SET_LIFE":
      return setLife(game, actor, action);
    case "ROLL_DIE":
      return rollDie(game, actor, action, ctx);
    case "NEXT_TURN":
      return nextTurn(game, ctx);
    case "SEND_CHAT":
      return sendChat(game, actor, action, ctx);
    case "LEAVE_GAME":
      return leaveGame(game, actor, ctx);
    case "END_GAME":
      return endGame(game, actor, ctx);
    case "KICK_PLAYER":
      return kickPlayer(game, actor, action, ctx);
  }
}

// --- helpers -----------------------------------------------------------------

function err(error: string): ActionResult {
  return { ok: false, error };
}

function ok(game: Game): ActionResult {
  return { ok: true, game };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function requireStarted(game: Game): string | null {
  return game.started ? null : "game has not started";
}

/** Find a card and verify the actor owns it. */
function ownCard(
  game: Game,
  actor: Player,
  uid: string
): { player: Player; card: CardInstance } | null {
  const found = findCard(game, uid);
  if (!found) return null;
  if (found.player.id !== actor.id) return null;
  return found;
}

function removeFromZone(card: CardInstance, zones: Player["zones"]): void {
  for (const list of Object.values(zones)) {
    const i = list.indexOf(card);
    if (i !== -1) list.splice(i, 1);
  }
}

/** Detach anything attached to a card that leaves the battlefield. */
function detachFollowers(game: Game, uid: string): void {
  for (const player of game.players) {
    for (const card of player.zones.battlefield) {
      if (card.attachedTo === uid) card.attachedTo = undefined;
    }
  }
}

// --- actions -----------------------------------------------------------------

function loadDeck(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "LOAD_DECK" }>,
  ctx: Ctx
): ActionResult {
  const entries = [...action.library, ...action.sideboard];
  if (entries.length === 0) return err("deck is empty");
  if (entries.length > MAX_DECK_ENTRIES) {
    return err(`too many distinct cards (max ${MAX_DECK_ENTRIES})`);
  }
  const total = entries.reduce((sum, e) => sum + e.count, 0);
  if (total < 1 || total > MAX_TOTAL_CARDS) {
    return err(`deck has ${total} cards (max ${MAX_TOTAL_CARDS})`);
  }
  for (const entry of entries) {
    if (
      !Number.isInteger(entry.count) ||
      entry.count < 1 ||
      entry.count > 99 ||
      typeof entry.cardId !== "string" ||
      entry.cardId.length === 0 ||
      entry.cardId.length > 64
    ) {
      return err("bad deck entry");
    }
  }

  const zones = emptyZones();
  for (const entry of action.library) {
    for (let i = 0; i < entry.count; i++) {
      zones.library.push(newInstance(entry.cardId, ctx));
    }
  }
  for (const entry of action.sideboard) {
    for (let i = 0; i < entry.count; i++) {
      zones.sideboard.push(newInstance(entry.cardId, ctx));
    }
  }
  shuffle(zones.library, ctx.rng);

  actor.zones = zones;
  actor.hasDeck = true;
  systemMessage(
    game,
    `${actor.name} loaded a deck (${total} cards)`,
    ctx.rng,
    ctx.now()
  );
  return ok(game);
}

function newInstance(cardId: string, ctx: Ctx): CardInstance {
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

function setCommander(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "SET_COMMANDER" }>,
  ctx: Ctx
): ActionResult {
  const name = (action.name ?? "").trim().slice(0, 100) || "Commander";
  if (
    typeof action.cardId !== "string" ||
    action.cardId.length === 0 ||
    action.cardId.length > 64
  ) {
    return err("bad commander card id");
  }
  // The command zone holds exactly the chosen commander (replace on re-pick).
  const commander = newInstance(action.cardId, ctx);
  commander.annotations = [`${TOKEN_MARKER}${name}`];
  actor.zones.command = [commander];
  actor.hasDeck = true; // a commander alone is enough to be "ready"
  systemMessage(game, `${actor.name} set ${name} as their commander`, ctx.rng, ctx.now());
  return ok(game);
}

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

  const n = game.players.length;
  const seatIndex = game.players.indexOf(actor);
  // Default position: spread across the owner's band of the battlefield.
  const bandTop = (seatIndex / n) * 100;
  const bandHeight = 100 / n;
  const baseY = bandTop + bandHeight * 0.5;
  const start = actor.zones.battlefield.length;
  for (let i = 0; i < action.count; i++) {
    const token = newInstance(action.cardId ?? "", ctx);
    token.cardId = action.cardId ?? "";
    token.annotations = [`${TOKEN_MARKER}${name}`];
    token.x = 6 + ((start + i) % 12) * 7.5;
    token.y = baseY + Math.floor((start + i) / 12) * (bandHeight * 0.3);
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

function revealCards(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "REVEAL_CARDS" }>,
  ctx: Ctx
): ActionResult {
  if (action.cards.length === 0 || action.cards.length > MAX_REVEAL_AT_ONCE) {
    return err(`reveal 1–${MAX_REVEAL_AT_ONCE} cards`);
  }
  const revealed: { name: string; cardId: string }[] = [];
  const seen = new Set<string>();
  for (const entry of action.cards) {
    if (seen.has(entry.uid)) continue;
    seen.add(entry.uid);
    const found = ownCard(game, actor, entry.uid);
    if (!found) return err("card not found");
    const name = (entry.name ?? "").trim().slice(0, 100) || "Card";
    revealed.push({ name, cardId: found.card.cardId });
  }
  if (revealed.length === 0) return err("nothing to reveal");
  pushChat(game, {
    id: chatId(ctx.rng),
    at: ctx.now(),
    playerId: actor.id,
    kind: "reveal",
    cards: revealed,
  });
  return ok(game);
}

function shuffleLibrary(
  game: Game,
  actor: Player,
  ctx: Ctx
): ActionResult {
  shuffle(actor.zones.library, ctx.rng);
  systemMessage(game, `${actor.name} shuffled their library`, ctx.rng, ctx.now());
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

function rollDie(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "ROLL_DIE" }>,
  ctx: Ctx
): ActionResult {
  if (!ALLOWED_DIE_SIDES.includes(action.sides)) return err("unknown die");
  const result = 1 + ctx.rng.int(action.sides);
  pushChat(game, {
    id: chatId(ctx.rng),
    at: ctx.now(),
    playerId: actor.id,
    kind: "dice",
    sides: action.sides,
    result,
  });
  return ok(game);
}

function nextTurn(game: Game, ctx: Ctx): ActionResult {
  const started = requireStarted(game);
  if (started) return err(started);
  const i = game.players.findIndex((p) => p.id === game.activePlayerId);
  const next = game.players[(i + 1 + game.players.length) % game.players.length];
  game.activePlayerId = next.id;
  systemMessage(game, `It is now ${next.name}'s turn`, ctx.rng, ctx.now());
  return ok(game);
}

function sendChat(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "SEND_CHAT" }>,
  ctx: Ctx
): ActionResult {
  const text = (action.text ?? "").trim().slice(0, 500);
  if (text.length === 0) return err("empty message");
  const message: ChatMessage = {
    id: chatId(ctx.rng),
    at: ctx.now(),
    playerId: actor.id,
    kind: "text",
    text,
  };
  pushChat(game, message);
  if (game.chat.length > CHAT_CAP) {
    game.chat.splice(0, game.chat.length - CHAT_CAP);
  }
  return ok(game);
}

function leaveGame(game: Game, actor: Player, ctx: Ctx): ActionResult {
  removePlayer(game, actor.id);
  if (game.activePlayerId && game.players.length > 0) {
    const next = game.players.find((p) => p.id === game.activePlayerId);
    if (next) systemMessage(game, `It is now ${next.name}'s turn`, ctx.rng, ctx.now());
  }
  systemMessage(game, `${actor.name} left the game`, ctx.rng, ctx.now());
  return ok(game);
}

/** Host only: back to the lobby with the table cleared for a fresh game. */
function endGame(game: Game, actor: Player, ctx: Ctx): ActionResult {
  if (game.hostId !== actor.id) return err("only the host can end the game");
  if (!game.started) return err("game has not started");
  game.started = false;
  game.format = "freeform";
  game.activePlayerId = null;
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
  if (game.hostId !== actor.id) return err("only the host can remove players");
  if (action.playerId === actor.id) return err("leave the game instead of removing yourself");
  const target = findPlayer(game, action.playerId);
  if (!target) return err("player not found");
  removePlayer(game, target.id);
  if (game.activePlayerId && game.players.length > 0) {
    const next = game.players.find((p) => p.id === game.activePlayerId);
    if (next) systemMessage(game, `It is now ${next.name}'s turn`, ctx.rng, ctx.now());
  }
  systemMessage(game, `${actor.name} removed ${target.name} from the game`, ctx.rng, ctx.now());
  return ok(game);
}

function shuffle(list: CardInstance[], rng: Rng): void {
  for (let i = list.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
}
