# Mythic Table

A web-based virtual tabletop for Magic: The Gathering, inspired by Cockatrice.
No rules enforcement — a shared table where 2–6 friends drag cards between
zones, tap them, track life, roll dice, and chat. The server's only job is
keeping everyone's view in sync.

- **No accounts** — room codes (`PLAINS-42`) + display names
- **Bring your own decklist** — paste it; Scryfall resolves names and images
- **Hidden information by construction** — hands, libraries, and face-down
  cards are filtered per-player by the authoritative server
- **Reconnects are free** — your seat survives disconnects and refreshes

The full design lives in [`2026-08-19-mtga-tabletop-design.md`](./2026-08-19-mtga-tabletop-design.md).

## Layout

npm-workspaces monorepo, one Node process serving everything on one port:

| Workspace | What it is |
|---|---|
| `frontend/` | Next.js 16 (App Router) UI |
| `server/` | Custom Node entry (boots Next + `ws`), rooms, game engine |
| `shared/` | Wire + state types, consumed raw by both sides |

The game engine (`server/src/engine/`) is pure TypeScript with an injected
RNG — fully unit-tested; the UI talks to it only via validated actions over
the WebSocket.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Open two browser tabs (sessions are per-tab — that's two players), create a
table in one, join with the code in the other.

```bash
npm test           # engine + parser unit tests (vitest)
npm run build      # production build (next build + typecheck)
npm start          # production server (NODE_ENV=production implied)
```

`PORT` is respected in dev and prod.

## Playing

1. **Create a table** from the home page, share the code
2. **Load a deck** — paste any common decklist format; the sideboard section
   lands in your sideboard zone
3. **Start the game**, draw 7 (click the library pile)
4. **Left-click** a battlefield card to tap it; **drag** to move (onto piles
   to change zones, onto another card to attach); **right-click** for
   counters, notes, reveal, face-down, and more
5. Chat panel on the right: life totals, dice (d4–d100), next turn

## Deployment

Single Node process, `npm run build && npm start` (or Docker, below). Works
on Railway, Fly.io, Render, or any VPS. **Not Vercel** — serverless functions
can't hold WebSocket connections. Games live in server RAM only; a restart
clears rooms (accepted v1 trade-off).

### Docker (Linux)

```bash
docker compose up -d --build   # build + start on http://localhost:3000
docker compose logs -f         # follow
docker compose down            # stop (rooms are RAM-only; they're gone)
```

Custom host port: `MYTHIC_PORT=8080 docker compose up -d --build` (or put
`MYTHIC_PORT=8080` in a `.env` file). The image runs the same command as
`npm start` — the production Next build booted by the custom server via tsx —
as the non-root `node` user, with a healthcheck on `/`.

## Card data

All card data and images come from the [Scryfall API](https://scryfall.com/docs/api)
(free, no key, CORS-friendly) and are hotlinked from their CDN. Definitions
are cached in `localStorage`, so repeat decks resolve instantly. Please
respect their rate limits — the client batches and spaces requests.
