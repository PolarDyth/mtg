// Chat-producing actions: messages, dice rolls, card reveals.

import {
  CHAT_CAP,
  type Action,
  type ChatMessage,
  type PlayerId,
} from "@mythic/shared";
import { chatId, pushChat, type Game, type Player } from "../state";
import {
  ALLOWED_DIE_SIDES,
  err,
  MAX_REVEAL_AT_ONCE,
  ok,
  ownCard,
  type ActionResult,
  type Ctx,
  type HandlerMap,
} from "./internal";

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

function revealCards(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "REVEAL_CARDS" }>,
  ctx: Ctx
): ActionResult {
  if (action.cards.length === 0 || action.cards.length > MAX_REVEAL_AT_ONCE) {
    return err(`reveal 1–${MAX_REVEAL_AT_ONCE} cards`);
  }
  // Audience: absent = whole table. When present, every id must be a seated
  // other player — strict rejection (not silent drop) so a stale target can
  // never accidentally broadcast a private reveal to everyone.
  let to: PlayerId[] | undefined;
  if (action.to !== undefined) {
    if (action.to.length === 0) return err("no reveal target selected");
    to = [...new Set(action.to)];
    for (const id of to) {
      if (id === actor.id) return err("unknown reveal target");
      if (!game.players.some((p) => p.id === id)) return err("unknown reveal target");
    }
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
    ...(to !== undefined ? { to } : {}),
  });
  return ok(game);
}

export const chatHandlers = {
  SEND_CHAT: sendChat,
  ROLL_DIE: rollDie,
  REVEAL_CARDS: revealCards,
} satisfies Partial<HandlerMap>;
