// Deck preparation: loading a decklist and picking a commander.

import type { Action, Format } from "@mythic/shared";
import {
  COMMANDER_MARKER,
  emptyZones,
  systemMessage,
  type Game,
  type Player,
} from "../state";
import {
  err,
  MAX_DECK_ENTRIES,
  MAX_TOTAL_CARDS,
  newInstance,
  ok,
  shuffle,
  type ActionResult,
  type Ctx,
  type HandlerMap,
} from "./internal";

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
  // When the pick comes from the loaded deck, remove that copy so the
  // 99-card library doesn't still contain the commander.
  for (const zone of [actor.zones.library, actor.zones.sideboard] as const) {
    const index = zone.findIndex((c) => c.cardId === action.cardId);
    if (index !== -1) {
      zone.splice(index, 1);
      break;
    }
  }
  // The command zone holds exactly the chosen commander (replace on re-pick).
  const commander = newInstance(action.cardId, ctx);
  commander.annotations = [`${COMMANDER_MARKER}${name}`];
  actor.zones.command = [commander];
  actor.hasDeck = true; // a commander alone is enough to be "ready"
  systemMessage(game, `${actor.name} set ${name} as their commander`, ctx.rng, ctx.now());
  return ok(game);
}

export const deckHandlers = {
  LOAD_DECK: loadDeck,
  SET_COMMANDER: setCommander,
} satisfies Partial<HandlerMap>;
