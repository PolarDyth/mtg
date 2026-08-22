**Date:** 2026-08-21
**Status:** In progress (v1 — second playtest round; §6–§15 shipped, plus
§3 transform + §5 mana pool via the round-3 data trio — only §2 stack and
§4 give-control remain)
**Project:** Mythic Table

# Playtest Feedback Round 2 → Implementation Roadmap

Second feedback round. Same format as round one
(`2026-08-20-playtest-feedback-roadmap.md`): verbatim feedback, root cause
verified against the current tree (file:line pointers), execution-ready steps,
tests, acceptance criteria. All round-one items (§2–§10 there) are verified
implemented in the current tree — this round is entirely new work.

Everything respects the design doc's core rule: **the server syncs state,
never judges legality**. Where a feature sounds rules-adjacent (casting,
mana), the plan keeps the server dumb and puts the intelligence in
client-side Scryfall data (`type_line`, `produced_mana`) — data-driven
defaults, never enforcement.

File paths relative to repo root. "The action checklist" = the AGENTS.md
recipe: union member in `shared/src/index.ts` → handler + one map entry in
the matching domain file under `server/src/engine/actions/` → tests in
`actions/<domain>.test.ts` (harness: `actions/testUtils.ts`).

## 1. Summary

| # | Feedback (verbatim) | Root cause | Plan | Effort | Priority | Status |
|---|---|---|---|---|---|---|
| 2 | "add a visible stack, easy to cast cards. If it can be cast add it to the stack first (i.e. land, played from library, played from graveyard etc..), if it isn't cast just play it" | No stack zone (7 fixed zones); no double-click anywhere; every play path lands directly on the battlefield | §2 | L | P2 | — |
| 3 | "cards that can be transformed currently isnt possible to be transformed, same with cards that have another side to it" | `CardDef` captures only the front face; `cardId` immutable server-side | §3 | M | P2 | **done** |
| 4 | "cant give control of cards to other players" | `ownCard` is strictly zone-owner; no controller concept anywhere | §4 | M | P2 | — |
| 5 | "add mana counter, when you tap a land it gives you a visible coloured mana chart…" | No mana state; `produced_mana` never fetched from Scryfall | §5 | M | P2 | **done** |
| 6 | "Look at top N cards of deck reveals your entire library, make it work similar to scry" | Look-at-top-N opened PileModal over the whole library, cards beyond N merely dimmed | §6 | S | P1 | **done** |
| 7 | "no preview for cards when you hover on scry" | ScryModal had zero hover-preview wiring | §7 | S | P1 | **done** |
| 8 | "add a way to discard a card at random" | `DISCARD_CARDS` is explicit-uids only | §8 | S | P1 | **done** |
| 9 | "add a turn counter" / "a time elapsed in a game" | `Game` has neither field | §9 | S | P1 | **done** |
| 10 | "auto scroll down the chat" | Scroll effect keyed on `messages.length`, which freezes at `CHAT_CAP = 200` | §10 | S | P1 | **done** |
| 11 | "easy leave lobby button" | `LEAVE_GAME` exists server-side but the frontend has zero senders and no leave UI | §11 | S | P1 | **done** |
| 12 | "be able to add plus one plus one counters to all creatures" | `SET_COUNTERS` is per-card only | §12 | S | P2 | **done** |
| 13 | "add the ability to toggle grid snapping for more clean card layout" | Drops are free-form percentages; no snap setting | §13 | S | P2 | **done** |
| 14 | "change counter so that plus 1 plus 1 shows at the bottom right of the card or a normal number counter in the top left" | All counter kinds stack top-left; bottom-right is occupied by the note badge | §14 | S | P1 | **done** |
| 15 | "anyone can start the game and select the format" | Already implemented — hint added | §15 | — | — | **done** |

Effort: S ≤ half a day, M ≈ a day, L multi-day (all including tests).

Two decisions locked in review with the user, binding for §2 and §5:

- **Casting default is Cockatrice-style:** double-click/quick-play sends lands
  straight to the battlefield and everything else to the stack; menu items and
  modifiers override either way.
- **The mana pool is synced and public:** server-tracked per player, visible
  to everyone like life totals.

## 2. Visible stack + easy casting

**Feedback.** "add a visible stack, easy to cast cards. If it can be cast add
it to the stack first (i.e. land, played from library, played from graveyard
etc..), if it isn't cast just play it".

**Root cause.** The zone union is seven fixed zones with no stack
(`shared/src/index.ts:7-24`); zones are per-player `Record<Zone,
CardInstance[]>` (`server/src/engine/state.ts:8-21`). No double-click handler
exists anywhere in the frontend (zero `onDoubleClick`/`detail === 2` hits);
every play path — menu quick actions (`ContextMenu.tsx:36-66`), PileModal
buttons (`PileModal.tsx:212-226`), drag, Ctrl+Y play-top — sends
`MOVE_CARD { to: "battlefield" }`, landing stacked at the default (50,50)
(`internal.ts:125-136`).

**Plan.**

1. **Shared:** add `"stack"` to the `Zone` union and `ALL_ZONES`
   (`shared/src/index.ts:7-24`). It is a public zone — not in `HIDDEN_ZONES`
   (`view.ts:17`), so every viewer gets full card views automatically.
2. **Server (small — the engine is zone-generic):** `MOVE_CARD` already moves
   to any zone in the actor's record (`zones.ts:44-91`), so casting and
   resolving need no new action. Add: system chat lines for moves to/from the
   stack ("Ada casts Doom Blade", "Ada resolves Doom Blade" — name from the
   client-supplied pattern is unnecessary here; uids suffice, but a chat line
   on stack→battlefield/graveyard reads well in the log); confirm `END_GAME`
   reset (`admin.ts:23-49`) and `LOAD_DECK` zone replacement sweep the new
   zone (they iterate zone records — verify in tests).
3. **Frontend — casting (the actual ask):**
   - `CardSprite`/`HandFan`: double-click on a hand card = play. The client
     looks up the def's `type_line` (already in `CardDef`, `scryfall.ts:16`):
     contains "Land" → `MOVE_CARD { to: "battlefield" }`; anything else →
     `MOVE_CARD { to: "stack" }`. Data-driven default, zero server judgment —
     the player can always move things differently by hand.
   - Same rule behind a "Cast" quick action in the hand ContextMenu and the
     PileModal hover buttons ("play" for lands, "cast" otherwise — one
     `playCard(card)` helper in `GameTable` feeding all surfaces).
   - Plain click on battlefield cards keeps toggle-tap semantics
     (`GameTable.tsx:336-347`); double-click cast only applies off the
     battlefield (hand, pile viewers) so tap-toggling is never ambiguous.
4. **Frontend — the visible stack:**
   - A slim stack column beside your battlefield (and a mini stack row in
     each opponent band), newest on top, fed from `zones.stack` like any
     `PILE_CHIPS` surface; click a stack card for the full menu (move to
     battlefield = resolve, to graveyard = counter/fizzle, to exile, etc.).
   - A one-click **Resolve** button on your top stack card →
     `MOVE_CARD { to: "battlefield" }` + a client-computed cascade
     `SET_POSITION` (offset each resolve around the board center so resolved
     cards don't pile at 50,50 — client-side math, same frame rules as drag
     drops in `finishDrag`, `GameTable.tsx:297-308`).
   - `ZoneRail` gains a Stack chip; `PileModal`/`ZONE_TITLES` pick the new
     zone up generically (add the title entry, `PileModal.tsx:10-18`).

**Tests.** Server: `actions/zones.test.ts` — move to/from stack, chat lines,
index handling (`top` = first cast or last cast — pick and pin: top of stack
= most recent, matching "stack resolves last-in-first-out" intuition).
`view.test.ts` — stack contents visible to every viewer. e2e: cast in tab A
appears on B's stack; resolve moves it to the battlefield for both.

**Acceptance.**

- Double-click a creature in hand → it appears on everyone's stack; Resolve
  → battlefield, in a sensible position, for everyone.
- Double-click a land → straight to battlefield, no stack hop.
- Playing from graveyard/library/exile via pile viewer offers the same
  cast/play split.
- Nothing is enforced: any card can be moved to/from the stack by anyone who
  controls it, by drag or menu, regardless of type.

## 3. Transform / second faces

**Feedback.** "cards that can be transformed currently isnt possible to be
transformed, same with cards that have another side to it".

**Root cause.** `toDef` (`scryfall.ts:90-105`) uses `card_faces[0]` only as a
fallback for the front face's `mana_cost`/`type_line`/`image_uris`; the back
face is never captured, so the cache holds nothing to transform into. On the
server, `cardId` is immutable per instance (set only at creation in
`newInstance`, `LOAD_DECK`, `SET_COMMANDER`, `CREATE_TOKEN`); the only
face-ish toggle is the `faceDown` boolean (Alt+F → `SET_FACE_DOWN`,
`cards.ts:41-50`) which hides identity rather than switching it.

**Plan.**

1. **Data:** `CardDef` gains `back?: { id, name, small, normal, type_line }`,
   filled in `toDef` from `card_faces[1]` when the layout is `transform`,
   `modal_dfc`, or `reversible_card` (split/adventure cards keep their
   combined single identity). **Bump the card cache version** (`v3` → `v4`,
   `cardCache.ts:10`) — one bump shared with §5.
2. **Shared + server:** `TRANSFORM_CARD { uid, cardId, name }` (action
   checklist, `cards.ts` + map entry). The client supplies the target face's
   Scryfall id and display name — the server stays card-id agnostic exactly
   like `CREATE_TOKEN { cardId }` and `REVEAL_CARDS { name }` already do.
   Validation: `ownCard`-style control, card on a battlefield; swap
   `cardId`; counters, attachments, position, tapped all ride along
   untouched. System chat "Ada transforms Hunted Horror into Dimir House
   Guard" (client-supplied name).
3. **Frontend:** ContextMenu on an own battlefield card whose def has
   `back` → "Transform to <other face name>" (label flips direction based on
   which face is showing: current `cardId === def.id` → offer `back`,
   otherwise offer front). Every client resolves the other face's def lazily
   on demand (the `useCardDefs` pattern already used for related tokens).
   Optional polish: Alt+T keybind acting on the hovered card
   (`keybinds.ts` + dispatcher + `SHORTCUT_GROUPS` + `keybinds.test.ts`).

**Tests.** Server (`actions/cards.test.ts`): transform swaps cardId, preserves
counters/position/attachedTo, rejects non-battlefield cards, round-trip
front→back→front. Frontend: `toDef` back-face extraction for a mocked
transform card and an MDFC (pure).

**Status: implemented 2026-08-21.** One shared v3→v4 cache bump carries
`back`, `produced_mana`, and `oracle_text` together. **Deviation from the
plan:** TRANSFORM_CARD does not swap `cardId` — Scryfall `card_faces` have
no ids of their own (both faces share the parent card id), so there is no
back-face id to swap to and every client already resolves both faces from
the one def. Instead `CardBase.showBack?: boolean` (public, rides the view
spread untouched) marks which face is showing; `TRANSFORM_CARD { uid, name }`
toggles it, own-card-only with **no zone restriction** (matches SET_TAPPED —
a transformed card that changes zones must never be stuck), logging
"Ada transforms into <name>" from the client-supplied target-face name.
Frontend: `faceDef(def, showBack)` overlays the back face's identity and
every surface resolves through it (CardSprite, drag ghost, pile viewer,
scry, reveal names); menu item "Transform to <other face>" on own face-up
cards with a back; keybind is **Alt+B** (the sketch's Alt+T was already
tap/untap). Face-down still wins over showBack in rendering.

**Acceptance.** Right-click a face-up Delver of Secrets → "Transform to
Insectile Aberration" → art, name, and identity swap for every player at the
table; counters and attachments survive; transforming back works. MDFCs
(Binding the Old Ways // Valheim) offer the same swap. Cards without a back
face show nothing.

## 4. Give control of cards to other players

**Feedback.** "cant give control of cards to other players".

**Root cause.** All card-mutating handlers gate on `ownCard`
(`internal.ts:74-83`), which requires the card to sit in the *actor's own*
zone — there is no controller-vs-owner concept anywhere in `CardInstance`
(`state.ts:8-21`). `MOVE_CARD` resolves the target zone against the actor's
own record (`zones.ts:54`), so a card can never enter another player's
battlefield; `ATTACH_CARD` requires both endpoints on the actor's own
battlefield (`cards.ts:122-130`). Threaten-style play is impossible; the
workaround (dragging a copy) loses counters and history.

**Plan.**

1. **Shared + state:** `CardInstance.controller?: PlayerId` (absent/undefined
   = owner). `CardView` carries it through unchanged (public information —
   no view filtering needed beyond passing it along).
2. **Action:** `SET_CONTROLLER { uid, to: PlayerId | null }` (checklist,
   `cards.ts` + map). Rules, all structural: the card must be on a
   battlefield; the actor must be the owner (giving) or the current
   controller (returning — `to: null` or the owner's id); `to` must be a
   seated player other than the actor. System chat "Ada gives control of
   Kederekt Leviathan to Bob" / "…takes it back".
3. **Act rights:** introduce `canControlCard(actor, found)` in
   `internal.ts` — owner **or** current controller — and use it in place of
   `ownCard` for `SET_TAPPED`, `SET_FACE_DOWN`, `SET_COUNTERS`,
   `SET_POSITION`, `SET_NOTES`, `ATTACH_CARD` (relax the both-on-my-
   battlefield rule to both-on-the-same-battlefield + actor controls both
   endpoints), and `MOVE_CARD`. `ownCard` itself stays for hidden zones
   (hand/library/sideboard) where control never applies.
4. **Zone-change semantics (deliberately dumb, MTG-shaped):** when a
   controlled card leaves the owner's battlefield, `controller` clears.
   `MOVE_CARD` on a controlled card routes the card to the **owner's** zone
   of the target type — a stolen creature that dies lands in its owner's
   graveyard, not the thief's. This falls out of `MOVE_CARD` resolving
   zones against the card's owner instead of the actor when the actor isn't
   the owner.
5. **Frontend:** ContextMenu on an own (or controlled) battlefield card →
   "Give control to…" submenu (opponents list) / "Return control".
   `CardSprite` renders a small colored-name chip on cards you don't own but
   control (and on your cards under someone else's control, so the table
   can always see who holds what).

**Tests.** `actions/cards.test.ts`: give/return happy path, wrong-actor
rejection, controller can tap/move/counters but a move routes to the owner's
zone, controller cleared on leaving battlefield, attach relaxation and cycle
guard still intact. `view.test.ts`: `controller` exposed.

**Acceptance.** Give your creature to an opponent: they can tap, move, and
counter it; when it dies it lands in *your* graveyard; control visibly
resets. Both players see the controller chip. Nothing is enforced about
*when* control may be given.

## 5. Mana pool (synced, public)

**Feedback.** "add mana counter, when you tap a land it gives you a visible
coloured mana chart, if possible take into account cards on the battlefield
that give extra mana depending on what is tapped, including mana dorks and
artifacts".

**Root cause.** No mana state exists anywhere (state, actions, or UI), and
`CardDef` captures no mana data — `produced_mana` is absent from the fetch
type entirely (`scryfall.ts:26-50`); `oracle_text` is read once for
commander eligibility and discarded.

**Plan** (locked: server-synced, visible to everyone).

1. **Data:** `CardDef.produced_mana: string[]` from Scryfall's top-level
   `produced_mana` (union across faces for DFCs). Share the **v3→v4 cache
   bump** with §3. Scryfall marks this on *any* card type — lands, mana
   dorks (`Llanowar Elves` → `["G"]`), artifacts (`Sol Ring` → `["C","C"]`
   → `["C"]` as a set of colors) — so "cards that give extra mana" works
   with zero extra logic: tapping anything with non-empty `produced_mana`
   offers its colors.
2. **Shared + server:** `Player.mana: Record<"W"|"U"|"B"|"R"|"G"|"C",
   number>` (init zeros in `makePlayer`, `state.ts:91-106`); action
   `SET_MANA { mana }` (checklist, `game.ts` next to `SET_LIFE` + map) —
   whole-record commit, each color an integer 0–99, structural validation
   only. `PlayerView` exposes it to everyone (public, like life). Reset to
   zeros in `END_GAME`'s sweep and on rejoin semantics unchanged (it's on
   the Player, so it survives disconnects like life does).
3. **Frontend — the tap convenience (client-side, never enforced):**
   clicking to tap your own card whose def has non-empty `produced_mana`
   adds those symbols to your pool and sends `SET_MANA` alongside
   `SET_TAPPED`. Deliberately dumb: it adds *all* listed colors (a
   "any color" land adds WUBRG; the player deletes what they didn't mean)
   and never subtracts on untap. Untapping doesn't drain the pool; nothing
   ever auto-empties — that would be rules judgment.
4. **Frontend — display:** a compact mana bar on your band (W/U/B/R/G/C
   pips, count badges, WUBRG-colored); smaller pips in each opponent band.
   Click your bar → popover with ± per color and a Clear button. Opponents'
   bars are read-only.

**Tests.** Server (`actions/game.test.ts`): `SET_MANA` validation (range,
structural), view exposure. Frontend: pure reducer `manaAfterTap(pool,
producedMana)` (unit-testable without DOM).

**Status: implemented 2026-08-21.** As locked: `Player.mana` +
`PlayerView.mana` public like life (zeroed in makePlayer and on END_GAME,
survives disconnects); `SET_MANA { mana: Partial<ManaPool> }` whole-record
commit (keys must be real colors, amounts integers 0–99, missing default
zero; no chat line — ±1 spam would drown chat and SET_LIFE doesn't log
either). Tap convenience fires on **all three tap paths** (plain click,
Alt+T, the menu item — one shared `tapForMana`), adding 1 of each distinct
`produced_mana` symbol (Sol Ring's ["C","C"] dedupes to one C); untapping
and Ctrl+U never touch the pool. **Deviation from the plan's popover:**
per user feedback the pips are directly editable on your band-header bar —
left-click +1, right-click/Shift-click −1 (floored at zero), ✕ clear when
non-empty, Alt+C clears — one gesture each way, no popover. Opponents'
bars read-only and hidden while empty.

**Acceptance.** Tap a Forest → your bar shows G: 1; tap a Llanowar Elves →
G: 2; everyone at the table sees your counts live. Edit/clear manually any
time. Tapping never *prevents* anything; the pool is bookkeeping only.

## 6. Look at top N — show only the top N

**Feedback.** "Look at top N cards of deck reveals your entire library, make
it work similar to scry".

**Root cause.** Ctrl+Alt+W (`keybinds.ts` `viewTopCards`) picked N, then
opened PileModal over the **entire library** with cards beyond N merely
dimmed to opacity-40 (`highlightTop` prop; pre-fix `PileModal.tsx:170-187`) —
players rightly read that as "revealed my whole library". The arrange flow
they asked for already exists separately as Scry… (`ActionsModal.tsx:47`,
`ScryModal.tsx`).

**Status: implemented 2026-08-21.** `PileModal` now slices the view: with
`highlightTop` set, only the top N cards render (selection, filter, bulk
moves, and reveal-to all operate on those N); the header shows "top N of M";
the footer says "just looking — closing won't shuffle" (true — `closePile`
already skipped the shuffle for this mode, `GameTable.tsx:509-516`).

**Acceptance (verified by code, manual check pending).** "Look at top 4"
shows exactly 4 cards; no dimmed tail; bulk actions and hover preview work
on them; closing does not shuffle.

## 7. Hover preview in the scry view

**Feedback.** "no preview for cards when you hover on scry".

**Root cause.** `ScryModal.tsx` rendered 112px-wide `small` images with no
hover wiring at all — no `onMouseEnter`, no `CardPreview` — unlike every
other surface (table, PileModal local zoom at `PileModal.tsx:181-182,
282-284`, chat mentions, reveal popup).

**Status: implemented 2026-08-21.** ScryModal takes `previewWidth` (passed
from `GameTable`, alongside every other preview surface), keeps a local
`zoom` def on card hover, and renders `CardPreview` fixed to the left of the
centered panel, vertically centered, clamped to the viewport.

**Acceptance.** Hovering a card in Scry/Surveil shows the large `normal`
art at your saved preview width; the preview resizes live with ctrl+scroll
if changed elsewhere.

## 8. Discard a card at random

**Feedback.** "add a way to discard a card at random".

**Root cause.** `DISCARD_CARDS` takes explicit uids only (`zones.ts:128-164`,
cap 30) — random selection would have to be client-side, which can't be
trusted (and can't be shown honestly to the table). Randomness belongs to
the server's `Ctx.rng`.

**Plan.** Shared: `DISCARD_RANDOM { count: number }` (checklist). Handler in
`zones.ts`: `requireStarted`; clamp count to 1–30 and to hand size; pick
`count` distinct random indices via `ctx.rng`; move those cards to the
graveyard; system chat "Ada discards 1 card at random". Frontend: hand
ContextMenu quick action "Discard 1 at random" + ActionsModal Hand tile
"Discard at random…" → `CountPickerModal` (default 1, max 30).

**Status: implemented 2026-08-21.** Handler picks via a partial
Fisher–Yates swap (`zones.ts`), validated 1–30, clamped to hand size, quiet
no-op on an empty hand. UI: ContextMenu "Discard 1 at random" (labeled so
it's clear it ignores the clicked card), ActionsModal tile with the
`discardRandom` picker mode (`pickerMax` gained a `handCount` param;
per-mode empty text). **Deviation from the plan:** the chat line does not
name the discarded cards — the server is card-id agnostic and the pick is
server-side, so names are unknowable at log time; the graveyard is public,
so the table sees exactly what was lost one snapshot later. Tests cover
seed determinism, clamping, and validation.

**Tests.** `actions/zones.test.ts` via the harness: seeded rng gives a
deterministic pick (assert exact uids), count clamped to hand size, empty
hand no-ops, chat line present.

**Acceptance.** Discarding at random from a known hand (seeded) moves
exactly the predicted cards; the chat names them; the table sees the same
result.

## 9. Turn counter + elapsed clock

**Feedback.** "add a turn counter" and "a time elapsed in a game" (reported
together — same surface).

**Root cause.** `Game` carries neither field (`state.ts:29-43`); `NEXT_TURN`
rotates the pointer and resets the phase but counts nothing
(`game.ts:80-100`); the only timestamps are per-message `at` fields.

**Plan.** Server: `Game.turnNumber: number` (0 in lobby, 1 at `START_GAME`,
`++` in `NEXT_TURN`) and `Game.startedAt: number | null` (`ctx.now()` at
`START_GAME`); both cleared on `END_GAME` alongside the existing resets
(`admin.ts:34`). `GameView` exposes both (identical for every viewer).
Engine purity note: `startedAt` comes from `ctx.now`, never `Date.now`
inline. Frontend: `PhaseBar` gains a "Turn N" chip next to the active
player's name and a live elapsed clock (mm:ss under an hour, h:mm:ss above)
ticked client-side from `startedAt` vs the browser clock — the server
snapshot stays change-driven; no protocol traffic while the clock runs.

**Status: implemented 2026-08-21.** As planned, no deviations. The clock
ticks inside `PhaseBar` (1s interval, only while `startedAt !== null`); the
chip reads "Turn N · mm:ss" at the left end of the strip. Tests: rotation
counting in `game.test.ts`, reset in `admin.test.ts`'s END_GAME case,
exposure in `view.test.ts`.

**Tests.** `actions/game.test.ts`: turn counts across rotations and reset on
`END_GAME`; `view.test.ts`: both fields exposed. e2e optional.

**Acceptance.** All players see "Turn 3" agree across tabs after several
passes; the clock starts at game start, not page load, and matches ±1s
across clients; END_GAME → new game restarts at Turn 1 / 0:00.

## 10. Autoscroll dies past the chat cap

**Feedback.** "auto scroll down the chat".

**Root cause.** Autoscroll *was* implemented (stick-to-bottom on new
messages, `ChatLog.tsx`) — but keyed on `messages.length`, while
`pushChat` caps the log at `CHAT_CAP = 200` (`state.ts:131-136`). Once a
long game fills the buffer, every new message evicts an old one, the length
stays pegged at 200, the effect never fires again, and autoscroll silently
dies mid-game — exactly when chat matters most.

**Status: implemented 2026-08-21.** The effect now keys on the **last
message id** (changes on every append, cap or no cap). Stickiness moved from
a ref to state so a "↓ N new messages" pill can render when you've scrolled
up, showing exactly what was missed (derived from the last message id seen
at the bottom); clicking it — or scrolling back within 40px of the bottom —
re-sticks. No `setState`-in-effect (repo lint error); all state updates
live in scroll/click handlers.

**Acceptance.** In a game past 200 chat messages, new messages still
autoscroll when you're at the bottom; scroll up and the pill counts what
you're missing; jump back down and it clears.

## 11. Easy leave button

**Feedback.** "easy leave lobby button".

**Root cause.** `LEAVE_GAME` exists end-to-end on the server
(`shared/src/index.ts:149`, handler `game.ts:142-152`: `removePlayer`
deletes the seat + cards, host transfers to `players[0]`, turn torch
reassigns, chat announces) — but the frontend **never sends it**: zero
senders, no leave UI anywhere, no `beforeunload`. Leaving = closing the tab,
which leaves a ghost "offline" seat for up to an hour of idle GC
(`rooms.ts:56-77`) and buries the seat with your deck attached.

**Plan (frontend only).** A "Leave table" button in the Lobby (header row)
and "Leave game" in the in-game header menu. Flow: confirm dialog ("Your
cards leave with you; the host role transfers" when mid-game) → send
`LEAVE_GAME` → `clearSession()` → `router.push("/")`. Navigation unmounts
the socket (`useGameSocket.ts:72-76`), which closes the connection. Note:
the server does not close the socket on `LEAVE_GAME` (further actions from
the conn just fail the seated check, `index.ts:45-46`) — routing away
immediately makes that moot.

**Status: implemented 2026-08-21.** `GameClient` owns one `leaveTable`
(confirm → `LEAVE_GAME` → `clearSession` → home via full page replace,
matching the file's existing cold-redirect pattern) and passes `onLeave` to
both surfaces: a "Leave table" button in the lobby's action row and a
red-tinted "Leave" button at the right end of the game header.

**Tests.** Server behavior already covered. Manual two-tab check: leave
mid-game in one tab, other tab sees "X left the game", host reassigns, seat
disappears.

**Acceptance.** One visible button, one confirm, and you're home — from both
lobby and mid-game; no ghost seat.

## 12. Bulk +1/+1 to all my creatures

**Feedback.** "be able to add plus one plus one counters to all creatures".

**Root cause.** `SET_COUNTERS` is per-card (`cards.ts:88-113`) and the
CounterPopover is per-card; there's no multi-card counter flow.

**Plan (frontend only — no protocol change).** The server cannot filter
"creatures" (card-id agnostic by design), so the client does it — the
philosophy-aligned answer. ActionsModal gains a Counters tile "Add +1/+1 to
all my creatures…" → for each card in *your* battlefield whose def's
`type_line` includes "Creature" (defs via `useCardDefs`, same lazy pattern
as token menus), send `SET_COUNTERS` with `counters["+1/+1"] = current + 1`.
`SET_COUNTERS`' owner check scopes this to your own creatures (ownCard) —
buffing opponents' boards stays out of scope (do it per-card, as today).
Confirm toast/summary optional ("+1/+1 added to 7 creatures").

**Status: implemented 2026-08-21.** ActionsModal gained a "Battlefield"
group with the tile (disabled at 0 creatures; the modal header now shows
"N in your library · M creatures"). GameTable keeps one `isCreature` helper
(`type_line` via the card-def cache) and the loop sends merge-commits —
existing counter kinds ride along, only `+1/+1` increments. No toast; the
counters appear on the board immediately.

**Tests.** None mandatory (composition of existing actions); manual check
with a mixed board (creatures, lands, tokens with counters preserved).

**Acceptance.** One click adds +1/+1 to every creature you control;
non-creatures untouched; existing per-kind counters on those creatures
survive (whole-record commit must merge, not replace — read current counters
from the live card, increment only the +1/+1 key).

## 13. Grid snapping toggle

**Feedback.** "add the ability to toggle grid snapping for more clean card
layout".

**Root cause.** Drops are free-form: `finishDrag` converts the pointer to
percentages of your board rect, clamps, and rounds to 0.1
(`GameTable.tsx:297-308`). The settings module holds exactly one key
(`mtg:preview-width`, `settings.ts:6`).

**Plan (frontend only).** `settings.ts` gains `mtg:grid-snap` (boolean,
default off) with a toggle in the header's view/zoom popover next to the
preview-width slider. In `finishDrag`, when enabled, snap `px`/`py` to the
nearest multiple of 5 before clamping — a 5% lattice keeps card-width
alignment clean at every board size without needing card dimensions.
Applies to your own board drops in every mode (drops always resolve against
your board rect, so one choke point).

**Status: implemented 2026-08-21.** As planned: `loadGridSnap`/`saveGridSnap`
in `settings.ts`; a tiny `useGridSnap` hook (table/hooks/) holds the state;
`useCardDrag` takes `snap` and `battlefieldDrop(rect, x, y, snap?)` rounds
to the 5% lattice after clamping (snap never escapes the clamp: 4/96 → 5/95
on x, 8/92 → 10/90 on y — unit-tested in foundation.test.ts). The header's
display popover (renamed from "Card preview size" to Display) hosts the
switch. The preference persists per browser.

**Tests.** None (presentation math); manual drag check with the toggle both
ways.

**Acceptance.** Toggled on, every drop lands on the 5% lattice and dragged
cards align in tidy rows; toggled off, placement is free-form again; the
preference persists per browser.

## 14. Counter badge placement

**Feedback.** "change counter so that plus 1 plus 1 shows at the bottom
right of the card or a normal number counter in the top left".

**Root cause.** `CounterChips` (`CardSprite.tsx:30-64`, mounted at :140)
stacks *every* counter kind in the top-left corner; the bottom-right is
occupied by the note badge (:146-153), top-right by the attach link
(:141-145). After round one's per-kind chips landed, all kinds look alike
and power counters get lost among bookkeeping kinds (Lore, Shield, custom).

**Plan (frontend only).** Split the cluster: **+1/+1 and −1/−1 chips move to
the bottom-right** (power counters — the ones players scan across a board);
all other kinds stay top-left as today. Relocate the note badge to the
top-right beside the attach link so the corner stays single-purpose.
`CounterChips` becomes two filters over the same map (`POWER_KINDS = new
Set(["+1/+1", "-1/-1"])`), same overflow-chip rule (≤3 visible + "+N"),
same tooltips. Keep `counterChipLabel` as is.

**Status: implemented 2026-08-21.** `CardSprite` renders a top-left cluster
(other kinds) and a bottom-right cluster (power kinds, slightly brighter
pill); the attach 🔗 and note 📝 icons now share one top-right flex
container instead of the note squatting on the bottom-right corner.

**Tests.** None (pure presentation); manual check per the acceptance list.

**Acceptance.** A card with `+1/+1 ×3` shows it bottom-right; `Lore ×2`
top-left; both visible simultaneously; note and attach icons still visible
top-right; nothing overlaps at small card sizes.

## 15. "Anyone can start the game and select the format" — works today

**Feedback.** "anyone can start the game and select the format".

**Root cause (none).** Verified against the tree: the Start button renders
unconditionally for every seated player (`Lobby.tsx:203-210`, no
`view.hostId` gate anywhere in the lobby), the format toggle
freeform/commander sits right above it (`Lobby.tsx:11-14, 164-178`), and
`START_GAME` is deliberately not host-gated (`game.ts:31-66`; only
`END_GAME`, `KICK_PLAYER`, `BAN_PLAYER` are host-only per AGENTS.md). The
playtesters likely assumed host-gating from other apps. **No behavior
change** — recorded here so it isn't re-reported.

**Status: hint added 2026-08-21.** The lobby's readiness line now reads
"N/M decks loaded · anyone can start" (with a tooltip explaining the button
isn't host-only), so the discovery problem is solved without touching
permissions.

## 16. Suggested build order

1. **Bug-fix pass (shipped 2026-08-21):** §10 autoscroll → §7 scry preview →
   §6 top-N-only.
2. **Small features (shipped 2026-08-21):** §11 leave button → §9 turn
   counter + clock → §8 random discard → §14 badge placement.
3. **Convenience (shipped 2026-08-21):** §12 bulk +1/+1 → §13 grid snap →
   §15 lobby hint.
4. **§5 mana pool + §3 transform together** (shipped 2026-08-21) — one
   shared cache bump (v3 → v4) covers both CardDef additions.
5. **§4 give control.**
6. **§2 stack & casting last** — the zone-union change ripples widest
   (shared → engine → view → ZoneRail/PileModal/GameTable/e2e), so let the
   protocol settle first.

## 17. Out of scope (this round)

- Cast legality / cost validation of any kind (core philosophy).
- Auto-emptying mana pools on phase change or turn pass (judgment).
- ~~Persisting full `oracle_text` (only `produced_mana` is captured).~~
  Superseded 2026-08-21 by round-3 #29 (pile-viewer full-text search) —
  `oracle_text` ships in the same v4 cache bump.
- Bulk counters on opponents' creatures (per-card, as today).
- Timer pauses / chess clocks.
- Anything that moves a card into another player's *zone* (control ≠
  ownership transfer — cards always live in their owner's zones).
