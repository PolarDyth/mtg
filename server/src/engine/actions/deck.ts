// Deck preparation: loading a decklist and picking a commander.

import type { Action, Format } from "@cardessa/shared";
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

/** Partner pairs cap the command zone: one commander or two, never more. */
const MAX_COMMANDERS = 2;

function setCommander(
  game: Game,
  actor: Player,
  action: Extract<Action, { type: "SET_COMMANDER" }>,
  ctx: Ctx
): ActionResult {
  const picks = action.cards;
  if (
    !Array.isArray(picks) ||
    picks.length < 1 ||
    picks.length > MAX_COMMANDERS
  ) {
    return err(`bad commander count (1-${MAX_COMMANDERS})`);
  }
  const clean = picks.map((pick) => ({
    cardId: pick.cardId,
    name: (pick.name ?? "").trim().slice(0, 100) || "Commander",
  }));
  if (
    clean.some(
      (pick) =>
        typeof pick.cardId !== "string" ||
        pick.cardId.length === 0 ||
        pick.cardId.length > 64
    )
  ) {
    return err("bad commander card id");
  }
  if (new Set(clean.map((pick) => pick.cardId)).size !== clean.length) {
    return err("duplicate commander");
  }
  const prev = actor.zones.command;
  // Fresh picks leave the 99 (one copy each, library first then sideboard) —
  // picks already in the zone don't re-remove a second copy from the deck.
  for (const pick of clean) {
    if (prev.some((c) => c.cardId === pick.cardId)) continue;
    for (const zone of [actor.zones.library, actor.zones.sideboard] as const) {
      const index = zone.findIndex((c) => c.cardId === pick.cardId);
      if (index !== -1) {
        zone.splice(index, 1);
        break;
      }
    }
  }
  // Commanders dropped from the set go back to the bottom of the library.
  for (const old of prev) {
    if (!clean.some((pick) => pick.cardId === old.cardId)) {
      actor.zones.library.push(old);
    }
  }
  // Full-set commit: kept picks keep their instance (uid, counters, notes —
  // only the † name annotation is refreshed); new picks get fresh instances.
  actor.zones.command = clean.map((pick) => {
    const existing = prev.find((c) => c.cardId === pick.cardId);
    if (existing) {
      existing.annotations = [
        `${COMMANDER_MARKER}${pick.name}`,
        ...existing.annotations.filter((a) => !a.startsWith(COMMANDER_MARKER)),
      ];
      return existing;
    }
    const commander = newInstance(pick.cardId, ctx);
    commander.annotations = [`${COMMANDER_MARKER}${pick.name}`];
    return commander;
  });
  actor.hasDeck = true; // a commander alone is enough to be "ready"
  const names = clean.map((pick) => pick.name).join(" + ");
  systemMessage(
    game,
    `${actor.name} set ${names} as their commander${clean.length > 1 ? "s" : ""}`,
    ctx.rng,
    ctx.now()
  );
  return ok(game);
}

export const deckHandlers = {
  LOAD_DECK: loadDeck,
  SET_COMMANDER: setCommander,
} satisfies Partial<HandlerMap>;
