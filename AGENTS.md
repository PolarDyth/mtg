# Cardessa — Workspace Guide

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
docker compose up -d --build   # production Docker image (Dockerfile at root)
```

Focused typecheck/lint: `npx tsc --noEmit` and `npx eslint src` inside
`frontend/` or `server/`. Protocol e2e (needs dev server up):
`node server/scripts/e2e-m2.js`. Two browser tabs = two players (identity is
per-tab sessionStorage).

CI: GitHub Actions (`.github/workflows/ci.yml`) runs `lint` / `test` / `build`
/ `e2e` / `docker` on every PR and push to main — the same root scripts, verbatim.
The `e2e` job builds, boots `NODE_ENV=production npm start`, and runs both
`server/scripts/e2e-*.js` scripts; `docker` builds the production image
(no push). Node version is pinned in `.nvmrc` — keep it in sync with the
Dockerfile's `ARG NODE_VERSION`. These checks are required on main (branch
protection), so a red check blocks merge.

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
- The game table UI mirrors that registry pattern: `GameTable.tsx` is a thin
  composition root (~500 lines); feature state/logic live in per-feature
  hooks under `frontend/src/components/game/table/hooks/` (drag, arrow/attach
  picking, piles, picker/scry flow, hand selection, reveals, focus views,
  preview, menus, header menus), pure lookup/policy math in
  `table/foundation.ts` (colocated test; DOM hit-testing in
  `table/hitTest.ts`), extracted chrome in `table/components/` (TableHeader,
  DragGhost, SelectionBar, PickingBar). Each hook returns a `keybinds` slice
  — built with `satisfies KeybindSlice`, never an annotation, which would
  erase the required keys — that GameTable spreads into one exhaustive
  `Record<KeybindId, Handler>` (a KeybindId added to `lib/keybinds.ts`
  without a slice fails `tsc`), plus an `escape(): boolean` chained in
  `table/escape.ts` (priority tier first-true-wins: maximize → reveal popup
  → audience → arrow → attach; then a catch-all tier that all runs). To add
  a feature: new hook in `table/hooks/` (+ component in `table/components/`
  if it has chrome) → mount it in GameTable → add its slice to the keybind
  literal and its escape to the chain.
- Hidden info is filtered per-viewer in `view.ts`: opponents' hand/library/
  sideboard collapse to counts; face-down cards carry `cardId: null` for
  non-owners; reveal chat messages with `to` are delivered only to the
  revealer + named players (all other chat is shared verbatim).
  `CardInstance` (server, real id) vs `CardView` (wire, nullable).
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
  in `table/hooks/useFocusView` + `Battlefield` and never touch the wire
  protocol; drops always resolve against your own board's rect in
  `battlefieldRef` (owned by `table/hooks/useCardDrag`, pure drop math in
  `table/foundation.ts`'s `battlefieldDrop`). Mode
  switches animate via entrance keyframes in `globals.css` (`.board-in`,
  `.bar-in`, `.overlay-in` — the band grid is keyed per mode to replay
  them).
- Arrows (attack/target markers) are `game.arrows: Arrow[]` — public state,
  cleared by NEXT_TURN and END_GAME, pruned in `applyAction` when an
  endpoint card leaves the battlefield (`pruneArrows` is the single choke
  point). One outgoing arrow per author per source card (redraw replaces);
  anyone may clear. Rendered by `ArrowLayer`, a whole-table SVG inside
  Battlefield's root div that resolves endpoints from live DOM rects
  (`[data-card-uid]`, `[data-player-head]`) — never duplicate the
  mirroring math there; tips shorten to endpoint edges so they don't eat
  card clicks (arrowhead is pointer-events: none). Drawn by ctrl/⌘+right-
  click on any battlefield card — a sticky draft follows the cursor and the
  next left click on a card/player head places it (Esc cancels) — or via
  the menu's "Draw arrow to…" mode or Alt+A over a hovered card; a plain
  right-click always opens the card menu. Geometry math is pure in
  `arrowGeometry.ts`.
- Game shortcuts mirror Cockatrice's defaults, centralized in
  `frontend/src/lib/keybinds.ts` (Ctrl+D draw, Ctrl+E draw N, Ctrl+Enter
  next turn, Ctrl+U untap all, Ctrl+S shuffle, F3/F4/Ctrl+F3 view piles,
  Alt+Y/Alt+M mill, Ctrl+Shift+D discard 1 at random, Alt+P +1/+1 on all
  your creatures, Ctrl+Alt+G toggle grid snapping, Ctrl+Alt+S scry,
  Ctrl+Alt+V surveil, Ctrl+Alt+M mulligan, Ctrl+R remove my arrows,
  Shift+Enter focus chat…). Browser-reserved combos are remapped: token =
  Ctrl+Alt+T, look at top N = Ctrl+Alt+W, life ±1 = Ctrl+Alt+= / Ctrl+Alt+-.
  Card-level binds (Alt+A arrow, Alt+T tap/untap, Alt+H attach, Alt+F flip,
  Ctrl+Del graveyard, Ctrl+B bottom, Alt+N note) act on the **hovered
  card** — `hoverCard` in
  `table/hooks/useCardPreview`, fed by `onCardHover(def, card)` from
  CardSprite. Handlers are slices composed per the table/ registry bullet
  above; the `useTableKeybinds` dispatcher ignores keys typed into
  INPUT/TEXTAREA and preventDefaults every matched combo. The
  header's Shortcuts button or `?` opens a cheat sheet (`ShortcutsModal`)
  rendered from `SHORTCUT_GROUPS`/`KEYBIND_LABELS` in the same file — a
  test keeps those groups covering every keybind. **Every new game
  mechanic ships with a keybind** — the recipe: 1) add the id to
  `KeybindId` + `DEFAULT_KEYBINDS` + `KEYBIND_LABELS` + one
  `SHORTCUT_GROUPS` entry in `lib/keybinds.ts` (the coverage test in
  `keybinds.test.ts` fails until all three Records agree — add the combo
  round-trip there too); 2) implement the handler in the owning feature
  hook's `satisfies KeybindSlice` (direct sends → `useGameActions`; new
  state → new hook in `table/hooks/`); 3) spread any new slice into the
  exhaustive `Record<KeybindId, KeybindHandler>` in GameTable — a new id
  without a slice fails `tsc`. Pick free `Alt+<key>` or `Ctrl+Alt+<key>`
  combos (browsers reserve bare Ctrl+T/W/N/P…); don't repurpose an
  existing combo — Shift variants only when the base is mnemonic
  (Ctrl+D draw vs Ctrl+Shift+D discard).
- No database: games live in server RAM; card definitions are cached in
  localStorage (versioned key `mtg:cards:vN` in `frontend/src/lib/cardCache.ts`;
  bump the version when CardDef's shape changes). UI preferences use
  `frontend/src/lib/settings.ts` (plain keys like `mtg:preview-width`).
- Scryfall is called browser-side only; batch via POST /cards/collection
  (≤75 identifiers, ~100ms between batches). Server never makes HTTP calls.
- First seated player is host (transfers on leave); host-only actions:
  END_GAME, KICK_PLAYER, BAN_PLAYER (ban = room-level name+IP list).

## Gotchas

- **Production runs source through tsx** (`node --import tsx server/src/index.ts`).
  Don't switch `npm start` to `server/dist` — compiled CJS cannot `require`
  the raw-TS `@cardessa/shared` package (this broke once already). The Docker
  runtime stage mirrors this on purpose; don't "optimize" it to compiled
  dist either. `.dockerignore` must keep `*.test.ts` in the context — the
  in-image `npm run build` typechecks them.
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
