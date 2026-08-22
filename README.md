# Mythic Table

A web-based virtual tabletop for Magic: The Gathering, inspired by Cockatrice.
No rules enforcement — a shared table where 2–6 friends drag cards between
zones, tap them, track life, roll dice, and chat. The server's only job is
keeping everyone's view in sync.

- **No accounts** — room codes (`RAVEN-STORM-4821`) + display names
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

The server binds to **localhost by default** (`HOST` env var overrides — the
Docker image sets `HOST=0.0.0.0`). For anything exposed beyond your machine,
put it behind a TLS-terminating reverse proxy: the rejoin token (the only
credential) travels in the WebSocket handshake, and plain HTTP lets anyone
on-path steal it. With Caddy that's two lines:

```
mtg.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

(nginx/Traefik work the same way.) When behind a proxy, also set
`TRUST_PROXY=1` so IP bans use the real client address from
`X-Forwarded-For` instead of the proxy's IP — with it unset, a forged XFF
header is ignored entirely, which is the safe default for direct exposure.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Listen port (dev and prod) |
| `HOST` | `127.0.0.1` | Bind address (`0.0.0.0` to expose on all interfaces; the Docker image sets this) |
| `TRUST_PROXY` | `0` | Trusted proxy hops: `1` behind one reverse proxy, `2` behind two… Client IP comes from the matching `X-Forwarded-For` hop |
| `ALLOWED_ORIGINS` | — | Comma-separated extra origins allowed to open the game WebSocket (for split-domain deployments) |
| `MAX_CONNECTIONS` | `300` | Total concurrent WebSocket connections |
| `MAX_ROOMS` | `100` | Total concurrent rooms |

### Docker (Linux)

```bash
docker compose up -d --build   # build + start on http://localhost:3000
docker compose logs -f         # follow
docker compose down            # stop (rooms are RAM-only; they're gone)
```

Custom host port: `MYTHIC_PORT=8080 docker compose up -d --build`; expose on
all interfaces with `MYTHIC_BIND=0.0.0.0` (loopback by default). The image
runs the same command as `npm start` — the production Next build booted by
the custom server via tsx — as the non-root `node` user, with a healthcheck
on `/`, `no-new-privileges`, all capabilities dropped, and a digest-pinned
`node:22-alpine` base.

## Card data

All card data and images come from the [Scryfall API](https://scryfall.com/docs/api)
(free, no key, CORS-friendly) and are hotlinked from their CDN. Definitions
are cached in `localStorage`, so repeat decks resolve instantly. Please
respect their rate limits — the client batches and spaces requests.
