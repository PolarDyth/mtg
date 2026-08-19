# Mythic Table — Design Document

**Date:** 2026-08-19
**Status:** Approved
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

One Next.js app served by a custom Node.js HTTP server. The same process hosts a
WebSocket server that runs the game logic. Deployed as a single Node app on any
non-serverless host (Railway / Fly.io / Render / VPS). **Vercel is not an option**
because serverless functions cannot hold WebSocket connections open.

```
┌─────────────────────────────────────────┐
│  One Next.js app + custom Node server   │
│  ├── Next.js UI  (pages, game table)    │
│  ├── Game server (ws, in-memory state)  │
│  └── Shared types (client ↔ server)     │
└────────────────┬────────────────────────┘
                 │ WebSocket
      ┌──────────┴──────────┐
   Your browser      Friends' browsers
```

**Why an authoritative server:** the server holds the true game state; clients send
actions and receive snapshots. This is how Cockatrice works, handles hidden
information correctly (hands, face-down cards), and makes reconnects trivial.

### Tech stack

| Layer      | Choice                              | Notes                                             |
|------------|-------------------------------------|---------------------------------------------------|
| Frontend   | Next.js (App Router) + TypeScript   | Known by author; huge ecosystem                   |
| Realtime   | `ws` on a custom Node server        | Attached via HTTP `upgrade`, same port as Next    |
| Card data  | Scryfall REST API, called from browser | CORS is allowed by Scryfall; images hotlinked from their CDN |
| Persistence| None — games in server RAM, decks in browser localStorage | No database in v1 |

## 4. Game State Model

A game is a single TypeScript object in server memory:

```ts
type Game = {
  code: string;                    // e.g. "PLAINS-42"
  players: Player[];
  activePlayerId: PlayerId;        // advanced by a "Next turn" button
  chat: ChatMessage[];
};

type Player = {
  id: PlayerId;
  name: string;
  life: number;
  zones: Record<Zone, CardInstance[]>;
};

type Zone = "library" | "hand" | "battlefield" | "graveyard" | "exile" | "command";

type CardInstance = {
  uid: string;                     // unique per physical card
  cardId: string;                  // Scryfall card ID (definition: art, cost, rules)
  x: number; y: number;            // battlefield position (percentages)
  tapped: boolean;
  faceDown: boolean;
  counters: Record<string, number>; // e.g. { "+1/+1": 3 }
  annotations: string[];            // sticky notes
};
```

**`uid` vs `cardId`:** Scryfall defines what a card *is*; a `CardInstance` is a
physical *copy* in a zone, with its own position, tap state, and counters. All
actions target `uid`s.

## 5. Protocol

Clients **never send state — only actions**. The server applies each action and
broadcasts an updated **full snapshot** to every client. Snapshots (rather than
incremental events) keep the client simple, make reconnects free, and are only a
few KB for a few hundred cards.

### Client → Server actions (v1 set)

```
JOIN_GAME, LOAD_DECK (card list), START_GAME
DRAW_CARDS { count }
MOVE_CARD { uid, to: Zone, index? }
SET_TAPPED { uid, tapped }
SET_FACE_DOWN { uid, faceDown }
SET_COUNTERS { uid, counters }
SET_POSITION { uid, x, y }
SHUFFLE_LIBRARY
MOVE_CARD_INDEX { uid, index }        // reorder within a zone (top of library etc.)
SET_LIFE { life }
ROLL_DIE { sides }
NEXT_TURN
SEND_CHAT { text }
LEAVE_GAME
```

**Validation is structural, not rules-based:** does the `uid` exist, is the player
seated, is the game started. The server never says "you can't do that" for game
reasons.

### Hidden information (personalized snapshots)

The server knows everything but sends each player a filtered view:

- Your own `hand`: full `CardInstance`s with `cardId`s
- Opponents' `hand`: count only
- Everyone's `library`: count only (order is secret)
- Face-down battlefield cards: position/counters visible, `cardId` hidden from
  everyone except the owner (server tracks the true identity)

Cheating is impossible by construction.

## 6. UI Design

Single full-screen game page, no scrolling:

- **Center:** the battlefield — cards absolutely positioned on a grid; each
  player's area is a horizontal band (yours at the bottom, opponents' stacked above)
- **Left of your area:** library (card-back with count badge; click to draw,
  right-click to shuffle), then graveyard, exile, command zone as small piles;
  clicking a pile opens a grid view to drag cards out
- **Bottom:** your hand, fanned; hover to enlarge
- **Right edge:** chat panel with life totals, dice buttons (d4/d6/d20), player
  names
- **Card interactions:** right-click → context menu (tap/untap, counters,
  face-down, attach note); left-click-drag to move on battlefield or onto zones
- **Rendering:** plain DOM + CSS transforms (`rotate(90deg)` for tap), Scryfall
  images, counters/tap indicators overlaid. No canvas or game engine. Battlefield
  cards ~75×75px with a large hover-zoom panel.

### Deck loading

1. Paste a decklist in any common format (`4 Lightning Bolt`, optional set codes,
   Scryfall/Moxfield/Archidekt exports)
2. Client parses names + quantities, resolves via Scryfall's
   `POST /cards/collection` endpoint (max 75 identifiers per request, so batch)
3. Player chooses library vs. sideboard per section; cards become shuffled
   `CardInstance`s
4. Card definitions cached in `localStorage` so repeat decks are instant

## 7. Project Structure

```
mythic-table/                # placeholder name
├── server.ts                # boots Next + WebSocket server on one port
├── src/
│   ├── app/                 # Next.js pages (home, /game/[code])
│   ├── components/game/     # GameTable, Card, HandFan, ChatPanel, ZonePile...
│   ├── server/              # game engine: state, actions, rooms — pure TS, no React
│   └── shared/              # message + state types used by both sides
```

## 8. Build Order (milestones)

Each milestone is independently testable/playable:

1. **Plumbing** — Next.js + custom server + WebSocket echo. Proves the setup.
2. **Rooms** — create game → room code → join (test with two browser tabs). Lobby.
3. **Decks** — paste decklist → Scryfall resolution → cards in library.
4. **Core actions** — draw, move zones, tap, shuffle; snapshots syncing to all tabs.
5. **The table** — drag-and-drop, context menus, hand fan, hover zoom. Biggest chunk.
6. **Chat, life, dice, next turn.**
7. **Robustness** — reconnects, edge-case cleanup, polish.

## 9. Edge Cases

- **Disconnects:** server keeps the player's seat and full state for 5 minutes;
  refresh/rejoin with same name + code restores everything (snapshots make this free)
- **Room GC:** empty rooms deleted after 1 hour
- **Player cap:** 6 per game
- **Deck mismatch:** missing card names from Scryfall are reported back for manual fix

## 10. Testing Strategy

- **Game engine:** pure functions `applyAction(state, action) → state`; unit tests
  cover all actions and hidden-info filtering
- **UI:** manual testing with two browser tabs side-by-side acting as two players

## 11. Deployment

Single Node process (`node server.ts` after build). Targets: Railway, Fly.io,
Render, or any VPS. Not Vercel (no persistent WebSockets on serverless).

## 12. Future Ideas (post-v1)

In-app deck builder, spectators, accounts, poison counters, mobile layout,
card search/zoom improvements, sound cues, P2P-offline practice mode.
