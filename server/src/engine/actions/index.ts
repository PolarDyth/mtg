// The action reducer: applies a client action to a game, mutating it in
// place. Pure with respect to IO — randomness and time arrive via Ctx so
// tests are deterministic.
//
// Dispatch goes through a compile-time exhaustive handler map. To add an
// action: extend the Action union in @mythic/shared, then add a handler and
// one map entry in the right domain file — a missing entry fails `tsc`. To
// add a domain: new file exporting a `satisfies Partial<HandlerMap>` map,
// plus one import and one spread here. A domain file can also graduate to a
// folder (cards.ts → cards/index.ts aggregating subdomain maps) without
// touching anything else, since domains are known here only by import path.

import { type Action, type PlayerId } from "@mythic/shared";
import { findPlayer, type Game } from "../state";
import { adminHandlers } from "./admin";
import { chatHandlers } from "./chat";
import { cardsHandlers } from "./cards";
import { deckHandlers } from "./deck";
import { gameHandlers } from "./game";
import {
  err,
  pruneArrows,
  type ActionResult,
  type Ctx,
  type Handler,
  type HandlerMap,
} from "./internal";
import { zonesHandlers } from "./zones";

const handlers: HandlerMap = {
  ...deckHandlers,
  ...zonesHandlers,
  ...cardsHandlers,
  ...gameHandlers,
  ...chatHandlers,
  ...adminHandlers,
};

export function applyAction(
  game: Game,
  action: Action,
  actorId: PlayerId,
  ctx: Ctx
): ActionResult {
  const actor = findPlayer(game, actorId);
  if (!actor) return err("you are not seated in this game");
  // Indexed by a union key the lookup's type is a union of narrowed
  // handlers, which TS can't call with the un-narrowed payload (its params
  // collapse to an intersection). Widen for the call — sound, because the
  // key and the payload come from the same action object.
  const handler = handlers[action.type] as Handler<Action>;
  const result = handler(game, actor, action, ctx);
  // Arrows are annotations: whatever the action did, anything they point at
  // must still exist.
  if (result.ok) pruneArrows(game);
  return result;
}

export { isBanned } from "./admin";
export type { ActionResult, Ctx } from "./internal";
