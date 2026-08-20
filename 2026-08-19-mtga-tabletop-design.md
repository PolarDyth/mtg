# Mythic Table — Design Document

**Date:** 2026-08-19
**Status:** Approved (rev 2, same day — review pass folded in: token creation, reveal, sideboard zone, attachments, ownership validation, workspace layout)
**Project:** A modern, web-based virtual tabletop for Magic: The Gathering, inspired by Cockatrice.

## 1. Summary

Mythic Table lets a small group of friends play Magic: The Gathering online with **no
built-in rules enforcement**. Like Cockatrice, the app is a shared table: players drag
cards between zones, tap them, track life, roll dice, and chat. The server's only job
is to keep everyone's view of the table in sync.

- **Players:** 2–6 per game, playing over the internet
- **Platform:** Web app (desktop browsers first)
- **Joining:** Room codes + display names, no accounts
- **Cards:** All card data and images from the Scryfall API (free, no key)

## 2. Non-Goals (v1)

Explicitly out of scope for version 1, in rough priority order for later versions:

- **Rules enforcement** — the core philosophy; likely never full enforcement
- **In-app deck builder** — v1 uses pasted decklists instead
- **Spectators**
- **Accounts / friends list**
- **Mobile-specific UI** (should be usable but not optimized)

## 3. Architecture

An npm-workspaces monorepo served by **one custom Node.js process**: the entry point
(`server/src/index.ts`) boots the Next.js app in `frontend/` programmatically and
attaches a WebSocket server to the same HTTP server. Deployed as a single Node app on
any non-serverless host (Railway / Fly.io / Render / VPS). **Vercel is not an option**
because serverless functions cannot hold WebSocket connections open.

```
┌─────────────────────────────────────────┐
│  One Node process (server/src/index.ts) │
│  ├── Next.js UI  (from frontend/)       │
│  ├── Game server (ws, in-memory state)  │
│  └── Shared types (@mythic/shared)      │
└────────────────┬────────────────────────┘
                 │ WebSocket (/ws)
      ┌──────────┴──────────┐
   Your browser      Friends' browsers
```

**Why an authoritative server:** the server holds the true game state; clients send
actions and receive snapshots. This is how Cockatrice works, handles hidden
information correctly (hands, face-down cards), and makes reconnects trivial.

**WebSocket routing:** the HTTP `upgrade` event is routed by path — `/ws` goes to the
game server, everything else (notably Next's dev-mode HMR socket) is forwarded to
Next's own upgrade handler (`app.getUpgradeHandler()`).

### Tech stack

| Layer      | Choice                              | Notes                                             |
|------------|-------------------------------------|---------------------------------------------------|
| Frontend   | Next.js 16 (App Router) + TypeScript + Tailwind 4 | Workspace package `@mythic/frontend`   |
| Realtime   | `ws` on the custom Node server      | Attached via HTTP `upgrade`, same port as Next    |
| Card data  | Scryfall REST API, called from browser | CORS is allowed by Scryfall; images hotlinked from their CDN |
| Persistence| None — games in server RAM, card defs in browser localStorage | No database in v1                      |

## 4. Game State Model

A game is a single TypeScript object in server memory:

```ts
type Game = {
  code: string;                    // e.g. "PLAINS-42"
  players: Player[];
  activePlayerId: PlayerId;        // advanced by a "Next turn" button
  chat: ChatMessage[];             // capped at 200 messages
};

type Player = {
  id: PlayerId;
  name: string;
  token: string;                   // secret used for rejoin
  connected: boolean;
  life: number;
  zones: Record<Zone, CardInstance[]>;
};

type Zone = "library" | "hand" | "battlefield" | "graveyard" | "exile"
          | "command" | "sideboard";

type CardInstance = {
  uid: string;                     // unique per physical card
  cardId: string;                  // Scryfall card ID (definition: art, cost, rules)
  x: number; y: number;            // battlefield position (percentages)
  tapped: boolean;
  faceDown: boolean;
  counters: Record<string, number>; // e.g. { "+1/+1": 3 }
  annotations: string[];            // sticky notes
  attachedTo?: string;              // uid of the host card (auras, equipment)
};
```

**`uid` vs `cardId`:** Scryfall defines what a card *is*; a `CardInstance` is a
physical *copy* in a zone, with its own position, tap state, and counters. All
actions target `uid`s. Tokens are just `CardInstance`s minted directly onto the
battlefield rather than drawn from a deck.

## 5. Protocol

Clients **never send state — only actions**. The server applies each action and
broadcasts an updated **full snapshot** to every client. Snapshots (rather than
incremental events) keep the client simple, make reconnects free, and are only a
few KB for a few hundred cards. `SET_POSITION` is sent by the client on drag-end
only, never per-mousemove, so drags don't flood the wire.

### Client → Server actions (v1 set)

```
LOAD_DECK { library, sideboard }     // resolved {cardId, count} entries
START_GAME { format? }               // "freeform" (20 life) | "commander" (40 life)
SET_COMMANDER { cardId, name }       // sits alone in your public command zone
DRAW_CARDS { count }
MOVE_CARD { uid, to: Zone, index? }  // index 0 = top of library
MOVE_CARD_INDEX { uid, index }
SET_TAPPED { uid, value }
SET_FACE_DOWN { uid, value }
SET_COUNTERS { uid, counters }
SET_POSITION { uid, x, y }
ATTACH_CARD { uid, to: uid | null }
CREATE_TOKEN { name, cardId?, count }
REVEAL_CARDS { uids }
SHUFFLE_LIBRARY
SET_LIFE { life }
ROLL_DIE { sides }
NEXT_TURN
SEND_CHAT { text }
LEAVE_GAME
END_GAME                            // host only: back to lobby, table cleared
KICK_PLAYER { playerId }            // host only: remove a player and their cards
BAN_PLAYER { playerId }             // host only: also blocks rejoining by name + IP
```

**Validation is structural, not rules-based:** does the `uid` exist, is the player
seated, is the game started — plus **ownership**: only the player who owns a card
may act on it (seat hygiene, not rules enforcement). `ROLL_DIE`, `NEXT_TURN`,
`SEND_CHAT`, and `START_GAME` are open to any seated player. The server never says
"you can't do that" for game *reasons*.

**Formats** tweak starting setup, never enforce rules: *Freeform* (default, 20
life) and *Commander* (everyone starts at 40 life). The lobby's commander picker
searches Scryfall for commander-eligible cards — legendary creatures plus
planeswalkers with "can be your commander" — and `SET_COMMANDER` places the pick
alone in your public command zone, visible to the whole table.

**Host:** the first player to sit is the host (crown marker); the role transfers
when they leave. Host-only actions: `END_GAME` (everyone returns to the lobby
with the table cleared for a rematch), `KICK_PLAYER` (removes a player and
everything they own), and `BAN_PLAYER` (removal plus a room-level ban list of
name + connection IP that rejects rejoins — per-room only, lives in RAM).
Removed/banned clients are redirected off the game URL so a refresh can't
silently re-seat them. In game, the room code lives in the header as a
one-click copy chip so inviting friends mid-session is obvious.

**Battlefield layout** mirrors a real table seen from your chair: every viewer
is seated at the bottom-left of their own screen. Players fill a corner grid —
2 players get two full-width rows, 3 players put both opponents on top with
your board spanning the bottom row, 4 players get quadrants, 5–6 players get a
3×2 grid — always with *your* board anchoring the bottom row flush left when
opponents share it (right beside your zone rail), spanning the full row
otherwise (`seatGrid` in `frontend/src/components/game/tableLayout.ts`;
opponents fill remaining cells in join order). A card's `x/y` are percentages
of the *owner's board* and refer to the card's *center*, stored in the
**owner's frame**; every opponent board renders point-mirrored — position
`(100−x, 100−y)` — like they're sitting across from you. Card art itself
stays upright and readable for every viewer; only placement mirrors.

**Focus views** swap the grid for fewer boards without touching positions:
each board's header has an expand button (one board fills the battlefield
area, with a maximize toggle for a true fullscreen overlay) and, on opponents,
a duel button showing your board and theirs stacked like a two-player table —
for attacking without everyone else's boards in the way. Esc backs out one
level (fullscreen → focus → table); focusing a player who leaves falls back
to the table automatically. Every mode switch plays a short entrance
animation (board grid scales in, mode bar slides down, fullscreen overlay
expands — disabled under `prefers-reduced-motion`) so the transition reads
clearly. Cards render bigger in focus views (Scryfall `normal` images);
drops always resolve against your own board's rectangle in whatever mode is
active.

**Server-side randomness:** shuffling and dice rolls happen on the server with an
injectable RNG, so clients can't influence them and tests are deterministic.

### Hidden information (personalized snapshots)

The server knows everything but sends each player a filtered view:

- Your own `hand`, `library`, `sideboard`: full `CardInstance`s with `cardId`s.
  Your library order is visible to you — that's what `SHUFFLE_LIBRARY` is for.
- Opponents' `hand` / `library` / `sideboard`: count only
- Everyone's `battlefield`, `graveyard`, `exile`, `command`: full cards
- Face-down battlefield cards: position/counters visible, `cardId` hidden from
  everyone except the owner (server tracks the true identity)

`REVEAL_CARDS` publishes chosen cards' identities to the whole table as a chat
message (carrying resolved name + `cardId` so every client can render them)
without moving them. Cheating is impossible by construction.

## 6. UI Design

Single full-screen game page, no scrolling:

- **Center:** the battlefield — cards absolutely positioned; each player's
  board is a bordered grid cell in the corner layout (yours always in the
  bottom row), with focus views (expand one board / duel one opponent) one
  click away from every board header
- **Left of your area:** library (card-back with count badge; click to draw,
  right-click to shuffle), then graveyard, exile, command, sideboard as small piles;
  clicking a pile opens a grid view to drag cards out
- **Bottom:** your hand, fanned; hover to enlarge
- **Right edge:** chat panel with life totals, dice buttons (d4–d100), player
  names, next-turn button
- **Card interactions:** right-click → context menu (tap/untap, counters,
  face-down, attach note, reveal, attach/detach, create token); left-click-drag to
  move on battlefield or onto zones; drop a card onto another battlefield card to
  attach it
- **Tokens:** a "create token" modal searches Scryfall for token cards
  (`q=t:token <name>`); unresolved names become generic labeled rectangles
- **Rendering:** plain DOM + CSS transforms (`rotate(90deg)` for tap), Scryfall
  images (`small` on the table, `normal` in the hover-zoom panel and in focused
  board views), counters/tap indicators overlaid. No canvas or game engine.
  Battlefield cards ~90px wide (up to ~170–260px in focus views) with a large
  hover-zoom panel.

### Deck loading

1. Paste a decklist in any common format (`4 Lightning Bolt`, `4x Name`, `SB: 1 X`,
   optional set codes, Scryfall/Moxfield/Archidekt exports)
2. Client parses names + quantities, resolves via Scryfall's
   `POST /cards/collection` endpoint (max 75 identifiers per request — batched,
   ~100ms apart) and caches definitions in localStorage (versioned key, minimal
   fields) so repeat decks are instant
3. Player reviews the split; cards become shuffled `CardInstance`s in `library`,
   the sideboard section lands in `sideboard`
4. Card names Scryfall can't resolve are reported back for manual fix

## 7. Project Structure

```
mtg/                          # npm workspaces monorepo, single git repo
├── package.json              # root scripts: dev / build / start / test
├── frontend/                 # @mythic/frontend — Next.js UI only
│   └── src/
│       ├── app/              # home, /game/[code]
│       ├── components/game/  # GameTable, Battlefield, CardSprite, HandFan,
│       │                     # ZonePile, ChatPanel, ContextMenu, TokenModal…
│       └── lib/              # useGame hook, decklist parser, Scryfall client,
│                             # localStorage card cache
├── server/                   # @mythic/server — custom Node entry + engine
│   └── src/
│       ├── index.ts          # boots Next (dir: ../frontend) + ws on one port
│       ├── ws.ts             # connection lifecycle, join/rejoin, heartbeats
│       ├── rooms.ts          # room codes, GC timers
│       └── engine/           # pure TS, unit-tested: state, actions, view, rng
└── shared/                   # @mythic/shared — wire + state types (raw TS source)
```

## 8. Build Order (milestones)

Each milestone is independently testable/playable:

1. **Plumbing** — workspaces scaffolded; Next served through the custom Node
   server; `/ws` echo round-trips from the client (HMR still works).
2. **Rooms** — create game → room code → join/rejoin by token → lobby; players
   list syncs across tabs; personalized snapshot machinery in place.
3. **Decks** — paste decklist → Scryfall resolution + caching → cards in library
   and sideboard; missing names reported.
4. **Core actions** — draw, move zones, tap, shuffle, counters, face-down,
   tokens, reveal, attach, life, dice, chat, turn; engine unit tests green;
   exercised from two browser tabs via a debug panel.
5. **The table** — drag-and-drop, context menus, hand fan, pile modals, hover
   zoom, attachment visuals. Biggest chunk.
6. **Robustness** — reconnects with backoff, heartbeats, room GC, edge-case
   cleanup, polish.

## 9. Edge Cases

- **Disconnects:** the server marks the player disconnected in views; refresh or
  rejoin restores everything via the per-player secret token stored in
  `sessionStorage` (display names alone are not identity — they can collide).
  Seats persist for the room's lifetime; evicting a mid-game player whose
  permanents are on the battlefield would be worse than an idle seat.
- **Room GC:** rooms are deleted 1 hour after the last connection closes.
  Nothing persists to disk — a server restart clears all games (accepted v1).
- **Player cap:** 6 per game
- **Deck mismatch:** missing card names from Scryfall are reported back for manual fix
- **Chat:** capped at the last 200 messages so snapshots stay bounded

## 10. Testing Strategy

- **Game engine:** pure functions `applyAction(state, action, actor, rng) → result`
  with an injected RNG; vitest suites cover every action's happy path, structural
  validation, ownership rejection, and hidden-info filtering (opponents can't see
  hand cardIds, face-down identities hidden from non-owners, own library visible)
- **UI:** manual testing with two browser tabs side-by-side acting as two players
  (sessionStorage is per-tab, so this works naturally)

## 11. Deployment

Single Node process (`node server/dist/index.js` after `next build` + `tsc`),
`PORT` respected. Targets: Railway, Fly.io, Render, or any VPS. Not Vercel (no
persistent WebSockets on serverless). No database.

## 12. Future Ideas (post-v1)

In-app deck builder, spectators, accounts, poison counters, mobile layout,
card search/zoom improvements, sound cues, P2P-offline practice mode.
