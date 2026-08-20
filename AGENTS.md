# Mythic Table — Workspace Guide

Web-based virtual tabletop for Magic: The Gathering (Cockatrice-style, **no rules
enforcement** — the server syncs state, never judges legality). Room codes +
display names, no accounts, 2–6 players. Design doc:
`2026-08-19-mtga-tabletop-design.md` — read it before changing protocol or game
behavior.

## Layout (npm-workspaces monorepo, one process, one port)

- `frontend/` — Next.js 16 (App Router, Tailwind 4) UI only. Game UI lives in
  `src/components/game/`, connection hooks + Scryfall client in `src/lib/`.
- `server/` — custom Node entry (`src/index.ts` boots Next via `next({ dir })`
  and attaches `ws` on `/ws`), rooms, and the game engine in `src/engine/`.
- `shared/` — `src/index.ts` is the entire client↔server contract: actions,
  wire messages, view types. Consumed as **raw TypeScript** by both sides
  (Next via `transpilePackages`, server via tsx). Change shared types first.

## Commands (run from the repo root)

```bash
npm run dev     # dev server on :3000 (custom server + Turbopack HMR)
npm test        # vitest: server engine tests + frontend decklist-parser tests
npm run build   # next build + server typecheck (tsc --noEmit)
npm start       # production — runs SOURCE via tsx, not dist (see gotchas)
```

Focused typecheck/lint: `npx tsc --noEmit` and `npx eslint src` inside
`frontend/` or `server/`. Protocol e2e (needs dev server up):
`node server/scripts/e2e-m2.js`. Two browser tabs = two players (identity is
per-tab sessionStorage).

## Architecture rules

- Clients send **actions only**; the server replies with full **personalized
  snapshots** (`engine/view.ts`). Never send state from the client.
- `server/src/engine/` is pure TypeScript: no IO, no Date.now/Math.random —
  randomness and time arrive via `Ctx { rng, now }` so tests are deterministic.
- Validation is **structural + card ownership** only (`engine/actions/`) —
  never reject an action for game-rule reasons; that's the core philosophy.
  Handlers live in per-domain files (`deck`, `zones`, `cards`, `game`, `chat`,
  `admin`) whose maps compose into the exhaustive `HandlerMap` registry in
  `actions/index.ts` — an Action added to shared without a handler fails
  `tsc`. To add an action: union member in shared → handler + one map entry
  in the matching domain file (new domain = new file + one spread line in
  `index.ts`; a domain file can graduate to a folder `cards/index.ts`
  aggregating subdomain maps with zero changes elsewhere) → tests colocated
  in `actions/<domain>.test.ts` (harness in `actions/testUtils.ts`; view
  tests in `engine/view.test.ts`).
- Hidden info is filtered per-viewer in `view.ts`: opponents' hand/library/
  sideboard collapse to counts; face-down cards carry `cardId: null` for
  non-owners. `CardInstance` (server, real id) vs `CardView` (wire, nullable).
- Battlefield layout is **per-viewer like a real table**: players fill a
  corner grid (`seatGrid` in `frontend/src/components/game/tableLayout.ts`)
  with your board anchoring the bottom row flush-LEFT when opponents share
  it (beside your zone rail), spanning the full row otherwise (2P = two
  full-width rows, 3P = you span the bottom, 4P = quadrants with you
  bottom-left, 5–6P = 3×2). Opponents' boards render
  with point-mirrored positions (`100−x, 100−y`) but **upright card art**
  (only placement mirrors, never the image). `x/y` are percentages **of the
  owning player's board** (owner's frame) and refer to the card's **center**
  — keep drop math in the owner's frame or views desync between players.
  Focus views (board expand / duel vs one opponent / maximize overlay) live
  in `GameTable` + `Battlefield` and never touch the wire protocol; drops
  always resolve against your own board's rect in `battlefieldRef`. Mode
  switches animate via entrance keyframes in `globals.css` (`.board-in`,
  `.bar-in`, `.overlay-in` — the band grid is keyed per mode to replay
  them).
- No database: games live in server RAM; card definitions are cached in
  localStorage (versioned key `mtg:cards:vN` in `frontend/src/lib/cardCache.ts`;
  bump the version when CardDef's shape changes).
- Scryfall is called browser-side only; batch via POST /cards/collection
  (≤75 identifiers, ~100ms between batches). Server never makes HTTP calls.
- First seated player is host (transfers on leave); host-only actions:
  END_GAME, KICK_PLAYER, BAN_PLAYER (ban = room-level name+IP list).

## Gotchas

- **Production runs source through tsx** (`node --import tsx server/src/index.ts`).
  Don't switch `npm start` to `server/dist` — compiled CJS cannot `require`
  the raw-TS `@mythic/shared` package (this broke once already).
- **Orphaned dev servers** can hold port 3000 after a session ("Another next
  dev server is already running", with a PID). Kill the PID
  (`taskkill /PID <pid> /T /F`), confirm with curl, then restart. Port-listen
  checks sometimes miss it; trust the next dev error message.
- Next 16 has breaking changes — consult the bundled docs in
  `frontend/node_modules/next/dist/docs/` before using framework APIs (see
  also the generated note in `frontend/AGENTS.md`). Server-component `params`
  is a Promise.
- eslint's `react-hooks/set-state-in-effect` is an **error** — use render-time
  state resets or ref patterns, and justified disable comments for the
  localStorage-hydration effect in `page.tsx`.
- Server package is CommonJS (no `"type": "module"`); relative imports are
  extensionless; `next`'s default export doesn't typecheck under NodeNext —
  that's why. Windows dev machine, Git Bash shell.
- Frontend game chrome uses lucide-react SVG icons, not emojis; dark
  zinc/emerald theme; card images hotlink Scryfall's CDN (`small` on the
  table, `normal` in zoom panels).
