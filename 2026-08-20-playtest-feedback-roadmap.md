**Date:** 2026-08-20
**Status:** Draft (v1 — first playtest round, translated into implementation steps)
**Project:** Mythic Table

# Playtest Feedback → Implementation Roadmap

First playtest round. Each section records the feedback verbatim, the root
cause found in the code (verified against the current tree, with file:line
pointers), execution-ready steps, and acceptance criteria. Everything here
respects the design doc's core rule (`2026-08-19-mtga-tabletop-design.md`):
**the server syncs state, never judges legality** — every fix below is state
synchronization + UI, not rules enforcement.

File paths are relative to the repo root. "The action checklist" refers to the
AGENTS.md recipe: union member in `shared/src/index.ts` → handler + one map
entry in the matching domain file under `server/src/engine/actions/` → tests
colocated in `actions/<domain>.test.ts` (harness: `actions/testUtils.ts`).

## 1. Summary

| # | Feedback (verbatim) | Root cause | Plan | Effort | Priority |
|---|---|---|---|---|---|
| 2 | "Cant see other players hands size" / "see how many cards your opponents hands" | Counts are already in every snapshot; nothing renders them | §2 | S | P1 |
| 3 | "Deck builder does not register theme card names such as the dead marshes which is actually Urborg, Tomb of Yawgmoth" | Resolver exact-matches canonical names only; "The Dead Marshes" is a Scryfall *flavor name* | §3 | S | P1 |
| 4 | "Not all token emblems are present" | Token search queries `t:token`, which excludes `t:emblem` cards | §4 | S | P1 |
| 5 | "be able to right click cards that can make tokens and be able to spawn it, take into account x number" | No `all_parts` usage anywhere; tokens only spawn from the global modal | §5 | M | P2 |
| 6 | "be able to clone cards" | No clone path exists; existing `CREATE_TOKEN` already suffices | §6 | S | P2 |
| 7 | "don't make cards stick together" | Releasing a drag anywhere over another card silently auto-attaches | §7 | M | P1 |
| 8 | "fix counters" | Counter editor lives inside the transient context menu with stale state; badge collapses all kinds into one number | §8 | M | P1 |
| 9 | "Easy game start" | Everyone must remember to manually draw 7; no ready state; no mulligan | §9 | M | P1 |
| 10 | "add proper phases in the game" | No phase model at all — a single `activePlayerId` pointer | §10 | L | P2 |

Effort: S ≤ half a day, M ≈ a day, L multi-day (all including tests).
"Deck builder" in the feedback maps to the paste-based `DeckLoader` — an
in-app deck builder remains a design-doc non-goal (§12).

## 2. Show opponents' hand size

**Feedback.** "Cant see other players hands size" (reported twice).

**Root cause.** Not a protocol gap — the server already personalizes hidden
zones to counts (`HIDDEN_ZONES` in `server/src/engine/view.ts:17`, opponents'
hand/library/sideboard arrive as `{kind:"count", count}` via
`shared/src/index.ts:137-139`). The UI simply never reads
`player.zones.hand` or `player.zones.library` for other players: the band
header only chips graveyard/exile/command (`PILE_CHIPS`,
`frontend/src/components/game/PlayerBand.tsx:10-14`, rendered at 119-137), and
the chat-rail player rows show only life (`ChatPanel.tsx:88-189`).

**Plan (frontend only).**

1. `PlayerBand.tsx` — add display-only **Hand** and **Library** chips to the
   header for opponents (reuse the chip pattern from `PILE_CHIPS`; count from
   either `ZoneView` kind, as `PlayerBand.tsx:123` already does). These two
   are not clickable — opponents' hand/library contents are hidden; the chips
   are informational only.
2. `ChatPanel.tsx` — append a hand-count badge (e.g. a small
   `Hand` lucide icon + number) to each opponent row in the player list.

**Tests.** None required (pure presentation of existing fields); manual check
in two tabs.

**Acceptance.**

- Every opponent band header and every chat-rail opponent row shows a live
  hand count (and bands show library count).
- Count updates on draw, discard, mulligan (§9), and reveal without a refresh.

## 3. Theme / flavor card names in the deck loader

**Feedback.** "Deck builder does not register theme card names such as the
dead marshes which is actually Urborg, Tomb of Yawgmoth".

**Root cause (verified against the Scryfall API on 2026-08-20).**
`GET /cards/named?fuzzy=the+dead+marshes` returns **Urborg, Tomb of Yawgmoth**
(set `ltc`, Tales of Middle-earth Commander) whose `flavor_name` is
"The Dead Marshes". Universes Beyond / Commander prints carry these themed
*flavor names* while their canonical (oracle) name is unchanged.
`resolveCards` (`frontend/src/lib/scryfall.ts:80-130`) matches inputs only
against the canonical name and front-face name (`scryfall.ts:110-118`), so
flavor-named entries land in `missing` and are silently skipped on load.
Autocomplete is not a fix here — `/cards/autocomplete?q=dead+marsh` suggests
only "Haunt of the Dead Marshes".

**Plan (frontend only).**

1. Extend the `ScryfallCard` type (`scryfall.ts:21-35`) with
   `flavor_name?: string` (collection responses include it).
2. In `resolveCards`, match an input against a card when it equals (case-
   and whitespace-normalized) the canonical name, the front-face name, **or
   the flavor name**.
3. Fuzzy fallback: after the batch pass, for each still-missing name (cap at
   ~20 per resolve, ~100ms apart — same good-faith rate-limit posture as the
   existing batching at `scryfall.ts:7-8`), call
   `GET /cards/named?fuzzy=<name>`; a 200 maps to a def, a 404 stays missing.
4. Extract the input→card matching decision into a pure function (e.g.
   `nameMatchesCard(input, card): boolean`) so it is unit-testable without
   network.
5. `DeckLoader.tsx` review UI: mark fuzzy-resolved entries (e.g. a subtle
   "matched via Scryfall search" hint) so a wrong fuzzy hit is visible before
   loading; misses continue to render red exactly as today.

**Tests.** New vitest cases next to `frontend/src/lib/decklist.test.ts` (pure
matcher): canonical match, front-face match (`Wear // Tear` via "Wear"),
flavor-name match ("The Dead Marshes" → `ltc` Urborg), case-insensitivity,
accented canonical names.

**Acceptance.**

- Pasting `1 The Dead Marshes` resolves to Urborg, Tomb of Yawgmoth with its
  Scryfall art.
- Ordinary typos resolve through the fuzzy pass; unresolvable names are still
  flagged in the review list and never silently dropped without the existing
  amber banner.

## 4. Missing token emblems

**Feedback.** "Not all token emblems are present".

**Root cause.** `searchTokenCards` (`scryfall.ts:157-166`) queries
`q=t:token <name>`. Scryfall indexes emblems as `t:emblem`, so planeswalker
emblems never match and can only be spawned as generic labeled rectangles.

**Plan (frontend only).** Change the query to
`(t:token or t:emblem) <name>` in `searchTokenCards` (same endpoint, same
`unique=print`, same top-8 slice). The modal copy ("no token found…") is
unchanged.

**Acceptance.** Searching "Jace" in the token modal lists Jace emblems with
art; spawn with a count works like any token. (Follow-up §5 makes the same
emblems reachable from the planeswalker's own card menu.)

## 5. Right-click a card → spawn its tokens (X-aware)

**Feedback.** "be able to right click cards that can make tokens and be able
to spawn it, take into account x number".

**Root cause.** Scryfall's `all_parts` links every card to the tokens/emblems
it creates, but `CardDef` (`scryfall.ts:10-19`) captures none of it (zero
`all_parts` usage in the codebase). Tokens are reachable only through the
global modal's name search.

**Plan.**

1. `CardDef` gains `relatedTokens: { id: string; name: string }[]`, filled in
   `toDef` (`scryfall.ts:55-69`) from `card.all_parts` — include a part when
   its `component === "token"` **or** its `type_line` starts with "Token" or
   "Emblem" (belt and braces across Scryfall's part typing); dedupe by id,
   cap at ~8.
2. **Bump the card cache version** (`frontend/src/lib/cardCache.ts`, versioned
   key `mtg:cards:vN`) — AGENTS.md requires it whenever `CardDef`'s shape
   changes.
3. `ContextMenu.tsx`: for battlefield cards whose def has
   `relatedTokens.length > 0`, render a **"Create token…"** submenu listing
   the related tokens by name. Look the def up from the card cache by
   `cardId`; if absent (an opponent's card we never loaded), resolve lazily
   with the existing `resolveCardsByIds` (`scryfall.ts:133-154`), which
   returns full card objects including `all_parts`.
4. Picking a token: ensure its def is cached (same `resolveCardsByIds` call —
   needed so every client can render the art), then open
   `CountPickerModal` (1–20) and send the existing
   `CREATE_TOKEN { name, cardId, count }`. The picker's free-entry number is
   the "X": `MAX_TOKENS_AT_ONCE = 20` (`server/src/engine/actions/internal.ts`)
   caps one action; larger X repeats via the existing Ctrl+G repeat-last
   (`keybinds.ts`, `GameTable.tsx`).

No server changes — `CREATE_TOKEN` (`server/src/engine/actions/cards.ts:140-179`)
already accepts an arbitrary client-supplied `cardId`.

**Tests.** Frontend: `toDef` extraction of `relatedTokens` (pure, mock card
JSON). Server: none.

**Acceptance.**

- Right-clicking a card known to make tokens (e.g. a planeswalker with an
  emblem) lists them; spawn carries art, name, and the chosen X.
- Cards with no related tokens show no submenu.

## 6. Clone cards

**Feedback.** "be able to clone cards".

**Root cause.** No clone/copy path exists anywhere (only `LOAD_DECK`,
`SET_COMMANDER`, `CREATE_TOKEN` create instances) — but
`CREATE_TOKEN { name, cardId, count }` is already exactly "mint a copy of
this card definition onto the battlefield".

**Plan (frontend only).**

1. `ContextMenu.tsx`: add **"Clone…"** for face-up battlefield cards — any
   player's card, since battlefield `cardId`s are public in every view
   (`view.ts` nulls `cardId` only for face-down cards seen by non-owners).
   Hide it for face-down cards (`card.cardId === null`).
2. Flow: `CountPickerModal` (default 1) →
   `CREATE_TOKEN { name: def.name, cardId: card.cardId, count }`.

The clone enters untapped with no counters and lands via the server's token
spread position — correct copy semantics with zero protocol changes. (Future
nicely-to-have: optional `x/y` on `CREATE_TOKEN` to spawn beside the original;
not needed now.)

**Acceptance.** Cloning any face-up card on the table (yours or an
opponent's) spawns N copies with the same art; face-down cards offer no
clone.

## 7. Stop cards sticking together (auto-attach)

**Feedback.** "don't make cards stick together" — clarified in review: *"When
you put a card over another it auto attaches, just remove that and instead
add a button to attach it manually."*

**Root cause.** `finishDrag` (`frontend/src/components/game/GameTable.tsx:244-292`)
hit-tests `document.elementFromPoint` and, when the pointer is anywhere over
another card's rectangle, silently sends `ATTACH_CARD` (`GameTable.tsx:253-260`)
— no modifier, no confirmation, easy to trigger by accident. Once attached,
the follower is pinned to the host's position and only the "Detach" menu item
(`ContextMenu.tsx:268-276`) or an explicit `ATTACH_CARD {to: null}` separates
them — dragging a follower to empty board does **not** detach (server
`SET_POSITION` never touches `attachedTo`, `cards.ts:52-62`).

**Plan.**

1. **Remove the auto-attach branch** in `finishDrag` — every drop resolves
   as a position (`SET_POSITION` / `MOVE_CARD` + `SET_POSITION`), exactly
   like dropping on empty board.
2. **Server: `SET_POSITION` clears `attachedTo`** — moving a card is an
   implicit detach (`server/src/engine/actions/cards.ts:52-62`). Dragging a
   follower off its host now detaches; the explicit Detach menu item stays.
3. **Explicit "Attach to…" mode** in the card menu, mirroring the existing
   "Draw arrow to…" targeting flow: menu item on an own battlefield card
   starts attach mode (visible cursor hint like arrow mode), the next left
   click on any battlefield card sends `ATTACH_CARD { uid, to: targetUid }`,
   Esc or a click on non-card cancels. Server-side cycle checking in
   `ATTACH_CARD` (`cards.ts:112-138`) already guards nonsense.

**Tests.** Server (`actions/cards.test.ts`): `SET_POSITION` on an attached
follower clears `attachedTo`; attach/detach cycle unchanged.

**Acceptance.**

- Dropping a card onto/next to another card never attaches — it just lands
  where dropped.
- Attaching happens only via "Attach to…" (or pre-existing menu paths);
  dragging an attached card away detaches it.

## 8. Fix counters

**Feedback.** "fix counters" — clarified in review: *"When you want to
increment the counter you need to press the plus then go off the right click
back on then press the plus again, it also doesnt update the number of the
counter on the right click menu. Ontop of that you can add multiple counters
but you can only see one."*

**Root cause.** The counter editor is nested inside the transient context
menu (`CounterEditor`, `ContextMenu.tsx:319-366`, behind the toggle at
253-259) whose `card` is the object captured when the menu opened
(`MenuState`, `ContextMenu.tsx:7-19`). Each `bump()` commits
`SET_COUNTERS` and waits for the snapshot round-trip, but the editor keeps
reading the stale captured card — so the displayed value never updates and
players close/reopen between every increment. Display compounds it:
`CounterBadge` (`CardSprite.tsx:30-43`) renders the **sum** of all kinds with
a `★` when more than one exists; the per-kind breakdown is tooltip-only. The
engine itself is fine (arbitrary string kinds, integer values 0–999, ≤12
kinds, counters survive zone moves and stay visible on face-down cards —
`cards.ts:85-110`, `view.ts:66,71`).

**Plan (frontend only; engine untouched).**

1. New **`CounterPopover`** component replacing the in-menu editor:
   - Opens from the card menu ("Counters…") anchored near the card and
     **stays open** until dismissed (Esc / click-away / close button).
   - Local optimistic state seeded from the *live* card (subscribe to the
     snapshot, not the menu's captured object) — steppers apply instantly
     and reconcile when the snapshot arrives.
   - Per kind: `− value +` stepper with press-and-hold repeat, a direct
     numeric input (loyalty 6 in one edit, not six clicks), and a remove
     (×) button.
   - Preset chips for common kinds: +1/+1, −1/−1, Lore, Shield, Stun — plus
     the existing free-text custom kind.
   - Commits whole-record `SET_COUNTERS` (existing action), debounced;
     zero-valued kinds dropped client-side as today.
2. `CardSprite.tsx`: replace the single-sum badge with **per-kind chips** —
   compact chip per counter kind (abbreviated label + count, e.g. `+1 ×3`,
   `LR ×2`), up to ~3 visible with an overflow `+2` chip whose tooltip lists
   all kinds (respect `MAX_COUNTER_KINDS = 12`).

**Tests.** None mandatory (presentation); the popover's kind/zero-stripping
logic mirrors `CounterEditor.commit()` and stays pure if extracted.

**Acceptance.**

- Click `+` five times in a row in one open editor; values update live.
- Set a kind to an arbitrary value in one edit; remove a kind with one click.
- A card with `+1/+1 ×3` and `Lore ×2` shows both kinds distinctly on the
  sprite, not `5★`.

## 9. Easy game start

**Feedback.** "Easy game start" — clarified in review: auto-draw opening
hand, ready checks in lobby, and a mulligan where **you pick the amount to
draw** (not "one less each time").

**Root cause.** After `START_GAME` (any seated player, no `hasDeck` check —
`server/src/engine/actions/game.ts:20-45`), every player must remember to
`DRAW_CARDS {count: 7}` manually; there is no ready/mulligan concept at all
(no such actions in `shared/src/index.ts:71-120`); deck loading is a
paste → resolve → review modal per player (`DeckLoader.tsx:91-182`) and the
lobby shows `hasDeck` only as small per-row text (`Lobby.tsx:125-127`).

**Plan.**

1. **Auto-draw on start (server).** In the `START_GAME` handler: for each
   player, draw `min(7, library.length)` from the top (deterministic splice —
   no `ctx.rng` needed) and add one system chat line ("Opening hands drawn").
   `DRAW_CARDS` itself is untouched. Players who load a deck mid-game or
   start deckless simply draw manually as today.
2. **Ready checks (frontend).** Lobby: a prominent "N/M decks loaded" line
   derived from `hasDeck`; the Start button stays always clickable but, when
   any seated player lacks a deck, first shows an inline confirm listing the
   names ("Bob has no deck yet — start anyway?"). Warn, never block —
   structural-only philosophy.
3. **Mulligan with chosen draw count (server + shared + frontend).**
   - Shared: `| { type: "MULLIGAN"; draw: number }` (the action checklist).
   - Handler in `game.ts` + one map entry in `gameHandlers`: `requireStarted`;
     validate `draw` is an integer 0–99 (structural); move the actor's entire
     hand back into the library, shuffle via `ctx.rng`, then draw
     `min(draw, library.length)`; system chat "Ada takes a mulligan to N".
   - Frontend: "Mulligan…" tile in the hand section of the Actions dock
     (`ActionsModal.tsx:28-112`) opening `CountPickerModal`, default = current
     hand size, free-entry max 99 (server clamps to library size).

**Tests.** `actions/game.test.ts` via the `startWithDeck` harness: auto-draw
gives every decked player 7; mulligan happy path (seeded rng — deterministic
order), `draw` clamped to library size, 0–99 validation, `requireStarted`.

**Implementation heads-up.** Auto-draw shifts hand/library indices in **every
existing `startWithDeck` test** — budget a sweep of `actions/*.test.ts`
expectations (and have the harness return the drawn uids to keep tests
readable). `server/scripts/e2e-m2.js` currently draws 7 manually after start
— update it or hands become 14.

**Acceptance.**

- Start → every player with a deck holds 7 cards, no manual draws, one chat
  line says so.
- Lobby shows deck readiness; starting with deckless players asks first.
- "Mulligan…" shuffles the hand away and deals exactly the chosen N, logged
  in chat.

## 10. Turn phases

**Feedback.** "add proper phases in the game" — clarified in review: phase
**labels plus small conveniences** (e.g. auto-untap when the turn passes to
you), while keeping the no-enforcement philosophy.

**Root cause.** There is no phase model at all: `Game` carries only
`activePlayerId` (`server/src/engine/state.ts:29-41`), advanced round-robin
by `NEXT_TURN` (`game.ts:67-71`) which also clears arrows. The design doc
deliberately skipped phases in v1; this adds them as **shared labels**, not
automation.

**Plan.**

1. **Shared** (`shared/src/index.ts`):
   ```ts
   export type Phase =
     | "untap" | "upkeep" | "draw" | "main1"
     | "startCombat" | "attackers" | "blockers" | "damage" | "endCombat"
     | "main2" | "end";
   export const PHASES: Phase[] = [ /* same order */ ];
   ```
   (mirrors the `ALL_ZONES` pattern). Action: `| { type: "SET_PHASE"; phase: Phase }`.
   `GameView` gains `phase: Phase`.
2. **Server**:
   - `Game` gains `phase: Phase`; `START_GAME` sets `"untap"`.
   - `NEXT_TURN`: next player (existing), `phase = "untap"`, clear arrows
     (existing) **+ untap the incoming player's battlefield cards** (the
     chosen convenience — deliberately dumb: cards that "shouldn't" untap
     just get re-tapped by hand). Add a system chat line "— Ada's turn —".
   - `SET_PHASE` handler (`game.ts` + map entry): `requireStarted` +
     `PHASES.includes(phase)` — purely structural, open to any seated player,
     no active-player gating (consistent with `NEXT_TURN`'s openness).
   - `view.ts`: expose `phase` (identical for every viewer).
3. **Frontend**:
   - New `PhaseBar.tsx`: slim clickable strip centered between the opponent
     rows and your band (in duel/board-focus modes, docked above your band —
     same placement logic as the mode switches in `GameTable`). One small
     labeled button per phase; active phase emerald-highlighted; shows the
     active player's name.
   - "Next ▸" button: client computes — before `"end"`, send
     `SET_PHASE` with the following `PHASES` entry; at `"end"`, send
     `NEXT_TURN`. Clicking any phase jumps directly via `SET_PHASE`.
   - Keybinds: repoint **Ctrl+Enter** to next-phase-or-turn; add
     **Ctrl+Shift+Enter** as pass-turn (`NEXT_TURN` directly). Update
     `keybinds.ts` + the dispatcher switch in `GameTable.tsx` and
     `keybinds.test.ts`.

**Tests.** `actions/game.test.ts`: `SET_PHASE` accepts valid members /
rejects unknown strings and pre-game; `NEXT_TURN` untaps the incoming
player, resets phase, clears arrows, logs chat. `view.test.ts`: `phase`
exposed. e2e: phase strip agrees across two clients.

**Acceptance.**

- The strip renders and stays in sync for all players (two tabs).
- Clicking a phase jumps there for everyone; "Next ▸" from `"end"` passes
  the turn — the new active player's cards arrive untapped.
- Nothing is enforced: any player can advance/jump; no legality checks
  anywhere.

## 11. Suggested build order

1. **Quick wins (one pass):** §2 hand chips → §3 flavor/fuzzy names → §4
   emblem search → §7 auto-attach removal + "Attach to…" mode.
2. **§8 counters** popover + per-kind badges.
3. **§9 game start** (auto-draw → ready checks → mulligan; includes the
   test-sweep heads-up).
4. **§5 card tokens + §6 clone** together — both ride `relatedTokens` /
   `CREATE_TOKEN` and share the cache-version bump.
5. **§10 phases** — largest item (protocol + engine + UI); last so the
   protocol settles first.

## 12. Out of scope (this round)

- In-app deck builder (design-doc non-goal; paste loader stays).
- Sample / quick-start decks (not selected in review).
- Counter keyboard shortcuts; player-level counters such as poison (design
  doc Future Ideas).
- Auto-spread for menu/keyboard-played cards landing stacked at (50,50) —
  real (`newInstance` default, `internal.ts:125-136`) but not part of the
  complaint; future polish alongside §7.
- Server-side card database (the server stays card-id agnostic).
