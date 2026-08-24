# Batch: six P2 quick wins (#42, #43, #44, #45, #46, #48) — three themed PRs

All six are size-S, P2, with plans already written in their issue bodies; two have user-locked
decisions (#43 rounds-not-passes, #44 bookkeeping-only undo). Deliberately out of scope: #49 (L),
#41 (M), #34 (M), #24 (L), and the P3 backlog (#47, #37, #40, #30, #32, #33).

Work happens on three branches off `main`, one PR each, closing issues via "Closes #NN".
PRs are created with the **gh CLI** (the MCP GitHub token is read-only). CI (lint/test/build/e2e/docker)
is required on main, so each PR must be green before merge.

---

## PR 1 — `feat/turn-bookkeeping` (closes #42, #43, #44)

### #43 Count one full round as one turn (user-locked: rounds)
Increment `turnNumber` only when turn order **wraps to the first seat** — wrap detection survives
players leaving mid-game without jumps (unlike derive-from-pass-count, which jumps when N changes).

- `server/src/engine/actions/game.ts` `nextTurn` (currently `game.turnNumber += 1` at ~line 114):
  ```ts
  const i = game.players.findIndex((p) => p.id === game.activePlayerId);
  const nextIndex = (i + 1 + game.players.length) % game.players.length;
  game.activePlayerId = game.players[nextIndex].id;
  // A "turn" on the counter is a full round: it advances only when order
  // wraps to the first seat, so N players = N passes per increment.
  if (nextIndex === 0) game.turnNumber += 1;
  ```
- Update semantics comments: `server/src/engine/state.ts` (`turnNumber` field doc) and
  `shared/src/index.ts` `GameView.turnNumber` doc ("+1 per NEXT_TURN" → "+1 per full round of turns").
- `server/src/engine/actions/game.test.ts`: the existing "counts turns from 1…" test asserts
  `turnNumber === 3` after two passes in the 2-player harness — becomes `2`. Add a 4-pass → 3 case.

### #42 Show elapsed time for the current turn
- `server/src/engine/state.ts`: new field `/** Epoch-ms stamp of the current turn's start; null in the lobby. */ turnStartedAt: number | null;` — init `null` in `createGame`.
- `game.ts`: stamp `game.turnStartedAt = ctx.now()` in `startGame` (beside `startedAt`), in `nextTurn`, and in `undoTurn` (below).
- `server/src/engine/view.ts` `personalize`: copy `turnStartedAt` verbatim (identical for all viewers).
- `shared/src/index.ts` `GameView`: `turnStartedAt: number | null;` with doc comment (clients tick against it, server never ticks — same pattern as `startedAt`).
- `frontend/src/components/game/PhaseBar.tsx`: new prop `turnStartedAt: number | null`; render a second readout inside the existing pill: `Turn {n} · {formatElapsed(now - startedAt)} · {turnStartedAt ? formatElapsed(now - turnStartedAt) : "00:00"}` with `title` tooltips ("time since the game started" / "time since the turn started"). The existing 1-second interval (keyed on `startedAt`) already re-renders both clocks — no new effect.
- `frontend/src/components/game/GameTable.tsx` (~line 311): pass `turnStartedAt={view.turnStartedAt}`.
- Engine tests: use a mutable `now` (`let t = 1_000; ctx.now = () => t`) to assert the stamp changes across NEXT_TURN; `view.test.ts` asserts exposure.

### #44 UNDO_TURN — bookkeeping-only step back (user-locked)
- `shared/src/index.ts` Action union: `| { type: "UNDO_TURN" }` (empty payload, mirrors NEXT_TURN at line 173).
- `game.ts` new `undoTurn(game, actor, action, ctx)` handler + `"UNDO_TURN": undoTurn` in `gameHandlers` (the `satisfies Partial<HandlerMap>` registry makes omission a tsc error — the 4-param shape must match):
  ```ts
  const started = requireStarted(game); if (started) return err(started);
  const n = game.players.length;
  const i = game.players.findIndex((p) => p.id === game.activePlayerId);
  const prev = game.players[(i - 1 + n) % n];
  game.activePlayerId = prev.id;
  game.phase = "untap";
  game.turnStartedAt = ctx.now();
  // Mirror of nextTurn's wrap increment: stepping back across the first
  // seat unwinds one round; clamp at 1 (bookkeeping, never below start).
  if ((i - 1 + n) % n === n - 1) game.turnNumber = Math.max(1, game.turnNumber - 1);
  systemMessage(game, `${actor.name} takes the turn back — it is now ${prev.name}'s turn`, ctx.rng, ctx.now());
  ```
  Deliberately **not** done (locked decision + stick-to-it choices, each with a comment): no zone/tap/draw rewind; arrows are left untouched (NEXT_TURN already cleared them and there is no history to restore); no untap (the incoming player was untapped when they first received the turn). No active-player gating, same as NEXT_TURN.
- Frontend:
  - `PhaseBar.tsx`: new `onUndoTurn` prop; small rewind button left of the Turn button (lucide `Undo2` icon, `title="Step the turn back (Ctrl+Alt+Z)"`).
  - `GameTable.tsx`: `onUndoTurn={() => send({ type: "UNDO_TURN" })}`.
  - Keybind recipe (all four records + test, per AGENTS.md): `frontend/src/lib/keybinds.ts` — add `undoTurn` to `KeybindId`, `DEFAULT_KEYBINDS: "Ctrl+Alt+Z"` (free — Ctrl+Alt uses only M/W/S/V/T/=/-/G), `KEYBIND_LABELS: "Step turn back"`, one entry in the "Board & turn" `SHORTCUT_GROUPS` group; handler slice in `useGameActions.ts` (`undoTurn: () => send({ type: "UNDO_TURN" })`) which GameTable already spreads; add the combo round-trip to `keybinds.test.ts` (uniqueness + exact coverage tests fail until all records agree).
- Tests (`game.test.ts`): previous-seat restore, counter decrement only across the wrap (and clamp at 1), zones/taps untouched, chat line emitted, any seated player may send it, turn clock restamped.

Sweep before opening the PR: grep the design doc (`2026-08-19-mtga-tabletop-design.md`) and `server/scripts/e2e-*.js` for `turnNumber`/NEXT_TURN assertions; update any that assume pass-counting.

---

## PR 2 — `feat/board-bookkeeping` (closes #45, #46) — engine only

### #45 Tokens dissolve when moved off the battlefield
- Helpers (in `server/src/engine/actions/internal.ts`, next to existing zone helpers; `TOKEN_MARKER` is exported from `state.ts:156` and stamped on `annotations[0]`):
  ```ts
  export function isToken(card: CardInstance): boolean {
    return card.annotations[0]?.startsWith(TOKEN_MARKER) ?? false;
  }
  export function tokenLabel(card: CardInstance): string {
    return card.annotations[0]?.slice(TOKEN_MARKER.length) ?? "token";
  }
  ```
- `zones.ts` `moveCard` (after the `ownCard`/target checks, before the normal splice): if `action.to !== "battlefield" && isToken(found.card)` → `detachFollowers(game, found.card.uid)` + `removeFromZone(found.card, actor.zones)` + `systemMessage(game, \`${actor.name}'s ${tokenLabel(found.card)} ceases to exist\`, …)` + `return ok(game)` (`pruneArrows` runs automatically after every successful action, so arrows aimed at the token self-clear).
- Same per-card guard in `discardCards`, `discardRandom`, `millCards` (remove from source, skip the destination push, one chat line per token), and any other `zones.ts` path that pushes into a non-battlefield zone (sweep the file — surveil included if present). Token→battlefield moves are untouched (flicker still works).
- Tests (`zones.test.ts`): token → hand/library/graveyard/exile vanishes with the chat line on every client-visible state; real cards unaffected; token→battlefield still works; mill with a token placed directly in library in the test; token as arrow endpoint → arrow pruned.

### #46 Newest attachment stacks behind
Source of truth is the battlefield array order; the render math in `CardSprite`/`PlayerBand` is untouched.
- `cards.ts` `attachCard`: after the cycle check and `found.card.attachedTo = host.uid`, reposition:
  ```ts
  const bf = actor.zones.battlefield;
  bf.splice(bf.indexOf(found.card), 1);
  const followers = bf.filter((c) => c.attachedTo === host.uid);
  bf.splice(bf.indexOf(followers[0] ?? host), 0, found.card);
  ```
  Newest lands **before** all existing followers → it leads `PlayerBand`'s `attached` list → smallest cascade offset, painted first (tucked in behind).
- Detach paths in `cards.ts` restore normal ordering by splicing the card to the **end** of the battlefield array: explicit detach (`action.to === null`) and the implicit detach in `setPosition` (~lines 81-83).
- Tests (`cards.test.ts`, ATTACH_CARD describe): with host H and attachments A then B → `indexOf(B) < indexOf(A) < indexOf(H)` (A keeps the outer/top cascade slot, B behind); detach B → B at array end, A still attached and before H; existing self/cycle/implicit-detach tests stay green (update any that assume array order).

---

## PR 3 — `fix/hand-chrome-z-index` (closes #48) — frontend only

- `frontend/src/components/game/HandFan.tsx`:
  - line 46 Select/Done toggle: `z-[70]` → `z-30`
  - line 55 "click cards to mark them" hint: `z-[70]` → `z-30`
  - line 67 hover lift: `hover:z-50` → `hover:z-30`
  - line 69 selected-card lift: `zIndex: isSelected ? 60 : i` → `isSelected ? 30 : i` (stays relative within the hand's own layer)
- `frontend/src/app/globals.css`: codify the scale in a comment near the top:
  `/* z-scale: board/content z-10 < hand chrome z-30 < modal backdrops z-40 < popovers/menus z-50 */`
- Result: every modal (z-40) and popover (z-50) now fully covers hand chrome; the lift still reads visually because unselected cards keep inline `zIndex: i`.

---

## Verification (every PR)

1. `npm test` (vitest: engine + frontend), `npx tsc --noEmit` in `server/` and `frontend/`, `npm run build` — all green locally before pushing.
2. `npm run dev` + `node server/scripts/e2e-m2.js` for PR 1 (protocol changed).
3. Two fresh browser tabs (per-tab identity): PR 1 — pass turns in a 3-player room, watch counter advance once per full cycle, rewind restores seat + decrements, turn clock resets each pass, reads identical on all tabs; PR 2 — bounce/mill a token (vanishes everywhere with one chat line), attach two auras and check stacking on all tabs; PR 3 — hand-select mode + open library viewer/token dialog → chrome fully covered. Note: tsx watch wipes in-RAM rooms on server edits — rejoin rooms after engine changes; stale-tab symptoms mean hard-refresh first.
4. Push branches, `gh pr create` with "Closes #NN" lines, wait for CI (required on main), then merge.

## File-touch summary

```
shared/src/index.ts                      # UNDO_TURN action, GameView.turnStartedAt, doc comments (PR1)
server/src/engine/state.ts               # turnStartedAt field + turnNumber doc (PR1)
server/src/engine/actions/game.ts        # round semantics, undoTurn, turn stamps (PR1)
server/src/engine/actions/{game,view}.test.ts   (PR1)
server/src/engine/actions/zones.ts       # token dissolution (PR2)
server/src/engine/actions/cards.ts       # attach/detach reorder (PR2)
server/src/engine/actions/internal.ts    # isToken/tokenLabel helpers (PR2)
server/src/engine/actions/{zones,cards}.test.ts (PR2)
server/src/engine/view.ts                # copy turnStartedAt (PR1)
frontend/src/components/game/PhaseBar.tsx        # rewind button, turn clock (PR1)
frontend/src/components/game/GameTable.tsx       # wire props (PR1)
frontend/src/components/game/table/hooks/useGameActions.ts  # undoTurn + keybind slice (PR1)
frontend/src/lib/keybinds.ts + keybinds.test.ts  # undoTurn recipe (PR1)
frontend/src/components/game/HandFan.tsx         # z-index (PR3)
frontend/src/app/globals.css                     # z-scale comment (PR3)
```
