# Refactor `engine/actions.ts` → typed handler registry (`engine/actions/`)

## Design

Replace the 661-line monolith (exhaustive `switch` + 20 handlers + private helpers) with a **folder of domain modules composed into a type-safe registry**. The compiler — not discipline — enforces completeness:

```ts
// engine/actions/internal.ts — foundation, imported by every domain file
import type { Action, CardInstance, PlayerId } from "@mythic/shared";
import type { Rng } from "../rng";
import type { Game, Player } from "../state";

export type Ctx = { rng: Rng; now: () => number };
export type ActionResult = { ok: true; game: Game } | { ok: false; error: string };

/** Uniform handler shape. Fewer-param handlers stay assignable (TS arity laxity). */
export type Handler<A extends Action = Action> = (
  game: Game, actor: Player, action: A, ctx: Ctx
) => ActionResult;

/** Compile-time exhaustive registry: one entry per Action member, payload narrowed. */
export type HandlerMap = { [K in Action["type"]]: Handler<Extract<Action, { type: K }>> };
```

Each domain file exports its handlers **without a type annotation**, using `satisfies` — this is load-bearing: annotation-less `satisfies Partial<HandlerMap>` keeps each key **required** in the inferred type, so spreading into `const handlers: HandlerMap` fails to compile if any action type is missing, mistyped, or unknown:

```ts
// engine/actions/deck.ts (tail of file)
export const deckHandlers = {
  LOAD_DECK: loadDeck,
  SET_COMMANDER: setCommander,
} satisfies Partial<HandlerMap>;
```

```ts
// engine/actions/index.ts — the ONLY file that knows all domains
const handlers: HandlerMap = {
  ...deckHandlers, ...zonesHandlers, ...cardsHandlers,
  ...gameHandlers, ...chatHandlers, ...adminHandlers,
};

export function applyAction(game, action, actorId, ctx): ActionResult {
  const actor = findPlayer(game, actorId);
  if (!actor) return err("you are not seated in this game");
  return handlers[action.type](game, actor, action, ctx);  // fully narrowed dispatch
}

export { isBanned } from "./admin";
export type { ActionResult, Ctx } from "./internal";
```

`ws.ts` imports `./engine/actions` and tests import `./actions` — Node directory-index resolution maps both to `actions/index.ts`, so **zero production-import churn**.

**Adding an action later:** add the union member in `shared/src/index.ts` → `tsc --noEmit` immediately errors "Property missing in HandlerMap" → write the handler + one map entry in the domain file → tests. **Adding a domain:** new file + 2 lines in `index.ts` (import + spread). **Subdomains:** any domain file can graduate to a folder (`cards.ts` → `cards/index.ts` spreading `cards/tokens.ts`, `cards/counters.ts`, …) — nothing outside that path changes, since domains are only referenced by import path.

## File tree (final state)

```
server/src/engine/
├── actions/
│   ├── index.ts        ~45 L  applyAction, root registry, re-exports (isBanned, Ctx, ActionResult)
│   ├── internal.ts     ~85 L  Ctx/ActionResult/Handler/HandlerMap types; err, ok, clamp,
│   │                          requireStarted, requireHost, ownCard, removeFromZone,
│   │                          detachFollowers, newInstance, shuffle, fixTurnAfterRemoval,
│   │                          limit constants (MAX_*, ALLOWED_DIE_SIDES)
│   ├── deck.ts         ~95 L  LOAD_DECK, SET_COMMANDER
│   ├── zones.ts       ~115 L  DRAW_CARDS, MOVE_CARD, MOVE_CARD_INDEX, SHUFFLE_LIBRARY
│   ├── cards.ts       ~185 L  SET_TAPPED, SET_FACE_DOWN, SET_COUNTERS, SET_POSITION,
│   │                          SET_NOTES, ATTACH_CARD, CREATE_TOKEN
│   ├── game.ts        ~105 L  START_GAME, NEXT_TURN, SET_LIFE, LEAVE_GAME
│   ├── chat.ts         ~85 L  SEND_CHAT, ROLL_DIE, REVEAL_CARDS
│   ├── admin.ts        ~85 L  END_GAME, KICK_PLAYER, BAN_PLAYER, isBanned
│   ├── testUtils.ts           setup(), startWithDeck(), act(), mustOk(), mustFail(), uidAt()
│   ├── deck.test.ts / zones.test.ts / cards.test.ts / game.test.ts /
│   ├── chat.test.ts / admin.test.ts
├── view.ts            (untouched)
├── view.test.ts       NEW — the "personalized snapshots" describe + "views expose the host" test
├── state.ts, rng.ts   (untouched)
```

Host-only actions (END/KICK/BAN) live together in `admin.ts` and share a new `requireHost(game, actor, msg)` helper (each keeps its exact current error string). `fixTurnAfterRemoval(game, ctx)` dedupes the identical removePlayer→"It is now X's turn" block in leave/kick/ban — extracted verbatim, call order preserved.

Three handlers currently inlined in the switch (`SET_TAPPED`/`SET_FACE_DOWN` combined case, `SET_POSITION`, `SET_NOTES`) are extracted to named functions — pure move.

## Behavior-preservation rules (hard constraints)

- All 23 handler bodies move **verbatim**: same validation, same limits, same error strings (tests match via `toContain`), same chat-message order, same in-place mutation semantics.
- `applyAction` keeps its exact 4-arg signature; `ActionResult`/`Ctx` shapes unchanged; `isBanned` still exported from `./engine/actions`.
- Imports adjust only mechanically: `./state` → `../state`, private helpers → `./internal`.
- Handler signatures stay as-is where they omit `action`/`ctx`/`actor` — TS assigns fewer-param functions to `Handler` fine (and the server has no ESLint config / `noUnusedParameters` is off).
- Known accepted limitation: TypeScript can't flag a *duplicate* key across two spread maps (last wins silently) — caught by review/per-action tests, not worth type gymnastics.

## Test split (45 tests, bodies verbatim — only imports + helper location change)

| engine.test.ts describe | goes to |
|---|---|
| `LOAD_DECK` (3) | actions/deck.test.ts |
| `SET_COMMANDER` (5) | actions/deck.test.ts |
| `START_GAME and NEXT_TURN` (4) | actions/game.test.ts |
| `DRAW_CARDS` (2), `MOVE_CARD and MOVE_CARD_INDEX` (5), shuffle test | actions/zones.test.ts |
| `SET_TAPPED/…/SET_COUNTERS` (3, + local `playOne`), `ATTACH_CARD` (2), 3 token tests | actions/cards.test.ts |
| 2 `REVEAL_CARDS` tests, `ROLL_DIE`, `SEND_CHAT` | actions/chat.test.ts |
| `SET_LIFE`, 2 `LEAVE_GAME` tests | actions/game.test.ts |
| `END_GAME and KICK_PLAYER` describe minus the view test (6) | actions/admin.test.ts |
| `personalized snapshots` (3) + `views expose the host` (1) | engine/view.test.ts |

Shared helpers move to `actions/testUtils.ts`; `engine.test.ts` and `engine/actions.ts` are deleted. Vitest's default glob picks up `actions/*.test.ts` automatically.

## Steps

1. Create `actions/internal.ts` (types + helpers + constants moved verbatim).
2. Create the 6 domain files — handler bodies copied verbatim, each ending in its `satisfies Partial<HandlerMap>` export map.
3. Create `actions/index.ts` (registry + `applyAction` + re-exports); delete `engine/actions.ts`.
4. Create `actions/testUtils.ts`; split engine.test.ts into the 6 domain test files + `engine/view.test.ts`; delete `engine.test.ts`.
5. Verify: `npm test` (all 45 pass) and `npx tsc --noEmit` in `server/`.
6. **Exhaustiveness canary:** temporarily add `| { type: "PING" }` to shared's Action union, confirm `tsc --noEmit` fails with a missing-handler error pointing at `actions/index.ts`, then revert. This proves the "can't ship an unwired action" guarantee.
7. Smoke-test live: `npm run dev`, then `node server/scripts/e2e-m2.js` (protocol e2e covers create/join/action/broadcast).
8. Update `AGENTS.md`: path reference `engine/actions.ts` → `engine/actions/`; replace "tests in `engine/engine.test.ts`" with the colocated-per-domain convention; add a 4-line "adding a new action" recipe. Design doc's file-tree line stays accurate ("state, actions, view, rng") — no change needed.

## Acceptance criteria

- `npm test` green with all 45 tests **unmodified** in their bodies — proof of a pure move.
- `npx tsc --noEmit` clean in `server/`; root `npm run build` clean.
- Canary check confirmed (missing handler = compile error), canary reverted.
- e2e-m2.js passes against a running dev server.
- No file in `engine/actions/` exceeds ~200 lines; `applyAction`'s public contract (signature, error strings, mutation semantics) unchanged; `ws.ts` untouched.
- AGENTS.md reflects the new structure and the add-an-action recipe.