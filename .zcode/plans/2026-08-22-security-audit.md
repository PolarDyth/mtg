# Mythic Table — Security Audit (2026-08-22)

**Scope:** full codebase — `server/src` (ws, rooms, engine, actions), `shared/src`,
`frontend/src`, root/Docker/compose/dependency layer.
**Method:** three parallel audit passes (server+shared, frontend, infra/deps) with
manual verification of every cited file and line. Read-only; nothing was modified.
**Verdict:** the core game engine is unusually well-hardened for a casual server.
The genuine risk is concentrated at the **network edge**: room-code enumeration,
missing Origin check, spoofable client-IP trust, absent rate/connection caps, and
default security headers/binds. 16 actionable findings below (SEC-01…SEC-16),
each with a recommended fix ready to implement.

**Deliberately not implemented** — this audit is report-only per decision on
2026-08-22. Fixes are tracked as GitHub issues (see "Issue mapping").

---

## Executive summary

What an attacker can do today against an internet-facing deployment:

1. **Find and gatecrash any active room** by sweeping the 660,000 possible room
   codes (SEC-01) — the room code is the system's *only* access control.
2. **Drive the server from anyone's browser** via a webpage that opens
   `ws://host/ws` (no Origin check, SEC-02), inheriting the victim's IP for
   ban evasion and room creation.
3. **Evade or poison IP bans** by sending a forged `X-Forwarded-For` (SEC-03).
4. **Exhaust CPU/RAM**: every accepted action re-broadcasts full personalized
   snapshots to every seat with zero rate limiting (SEC-04); connections and
   rooms are uncapped (SEC-05); battlefields grow without bound (SEC-06).

What an attacker **cannot** do (verified, see "Checked and OK"): read hidden
cards, impersonate a player id, move or manipulate another player's cards,
inject script into any client, pollute prototypes, crash the process with a
malformed action, or find a known-vulnerable dependency.

Severity scale: **High** (realistic remote compromise of the product's core
promise) / **Medium** (real attack requiring moderate effort or specific
deployment) / **Low** (hardening, defense-in-depth, or niche robustness).

---

## Findings

### SEC-01 — High — Room codes carry ~19.3 bits of entropy and joins are unthrottled

**Evidence** — `server/src/rooms.ts:11-23` (66-entry `WORDS` list),
`server/src/rooms.ts:90-94`:

```ts
private freshCode(): string {
  const word = WORDS[this.rng.int(WORDS.length)];
  const number = this.rng.int(10000);
  return `${word}-${String(number).padStart(4, "0")}`;
}
```

66 × 10,000 = 660,000 codes (log₂ ≈ 19.33). The RNG is crypto-backed
(`engine/rng.ts`, `node:crypto` `randomInt`) — codes are unpredictable but the
space is tiny. Nothing throttles join attempts: a failed `join` leaves the
connection free to try the next code (`ws.ts:159-174`), and every response is
an oracle (`"room not found"` vs `"room is full"` vs seating).

**Attack:** a script sweeps all 660k codes in minutes, joins any live room
(up to `MAX_PLAYERS` = 6 seats — filling them locks the actual friends out),
reads chat, and griefs the table. The room code is the only access control in
the system; this is the front door failing open. The design doc treats codes
as the privacy boundary, so this is a genuine bug, not a design choice.

**Recommended fix** (format approved by user 2026-08-22):
1. `freshCode()` → two words + 4 digits: `RAVEN-STORM-4821`
   (66² × 10⁴ ≈ 4.36 × 10⁹ ≈ **32 bits**). Update `isValidCode` regex in
   `rooms.ts:101-103` and the client-side copy + placeholder + error text in
   `frontend/src/app/page.tsx:65-66, 142`. Update `server/src/rooms.test.ts`.
2. Throttle joins in `ws.ts`: per-connection failed-join counter (close after
   ~5 failures in 10s) plus a per-IP failed-join window (~10/min → temporary
   "too many attempts" rejection). With 32-bit codes and throttling,
   enumeration is computationally hopeless.

**Acceptance criteria:** new codes match `^([A-Z]+)-([A-Z]+)-(\d{4})$`; a
connection sending >5 bad joins in 10s is closed; a clean room code typed on
the home page still joins; `rooms.test.ts` + e2e pass.

---

### SEC-02 — Medium/High — No Origin validation on WebSocket upgrades

**Evidence** — `server/src/ws.ts:58-64`:

```ts
export function handleGameUpgrade(req, socket, head): void {
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
}
```

No code in `server/src` reads `req.headers.origin`.

**Attack:** any website can silently open `ws://host/ws` inside a visitor's
browser (cross-site WebSocket hijacking). There are no cookies to steal, but
the attacker page can enumerate room codes (SEC-01), create/hold rooms, and
consume the victim's IP — defeating IP bans and rate limits aimed at the real
attacker. Cost to the victim's browser: negligible.

**Recommended fix:** in `handleGameUpgrade` (or just before it in
`index.ts:37-43`), if an `Origin` header is present, require it to match the
request's own `Host` (compare `new URL(origin).host` vs `req.headers.host`,
scheme http/https); support an `ALLOWED_ORIGINS` env override for split-origin
deployments. Absent `Origin` (curl, Node scripts, the e2e harnesses
`server/scripts/e2e-*.js`) stays allowed. Reject with a raw
`HTTP/1.1 403` + `socket.destroy()`.

**Acceptance criteria:** browser connection from the app's own origin works; a
page on another origin cannot open `/ws` (403 on upgrade); e2e scripts (no
Origin header) still pass.

---

### SEC-03 — Medium — Client IP taken from attacker-controlled `X-Forwarded-For` unconditionally

**Evidence** — `server/src/ws.ts:275-282`:

```ts
function clientIp(req: IncomingMessage): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? undefined;
}
```

The IP is stored per seat (`ws.ts:206`) and is the durable half of bans
(`engine/actions/admin.ts:86-89`, checked at `ws.ts:169`).

**Attack:** a directly-connected client sets `X-Forwarded-For: 1.2.3.4` and
(a) pre-poisons the ban list with arbitrary IPs (framing), (b) rotates the
header to bypass any IP ban. Even behind a single proxy the *first* hop is
wrong — the client controls its position; the rightmost untrusted hop is the
safe one. Behind a proxy that doesn't set XFF, every seat shares the proxy IP
(one ban bans the world).

**Recommended fix:** gate XFF parsing behind a `TRUST_PROXY` env var (number of
trusted proxy hops, default `0` = use `req.socket.remoteAddress`). When
`TRUST_PROXY=n ≥ 1`, take the n-th entry *from the right* of the XFF list.
Document in the README deployment section (set `TRUST_PROXY=1` behind
Caddy/nginx/Traefik).

**Acceptance criteria:** with `TRUST_PROXY` unset, a forged XFF is ignored
(ban lands on the real remote address); with `TRUST_PROXY=1` through a
forwarding proxy, the logged/banned IP is the real client; README documents
the setting.

---

### SEC-04 — Medium — No rate limiting; every accepted action re-broadcasts full state to every seat

**Evidence** — message loop `ws.ts:97-117` (no throttling); on success
`ws.ts:225-226` → `broadcast(game)`; `ws.ts:251-256` serializes a
personalized full snapshot **per connection**:

```ts
function broadcast(game: Game): void {
  for (const conn of conns) {
    if (conn.game !== game || !conn.playerId) continue;
    send(conn.ws, { type: "snapshot", state: personalize(game, conn.playerId) });
  }
}
```

**Attack:** a single client floods cheap always-succeeding actions (e.g.
`SHUFFLE_LIBRARY`, `zones.ts:117-126`, which even appends a chat line each
time). In a 6-player game with loaded decks, each ~100-byte inbound frame
produces up to 6 multi-hundred-KB outbound snapshots — a large CPU (personalize
+ JSON.stringify) and bandwidth amplification factor that pegs the process.

**Recommended fix:** token bucket per connection in a new
`server/src/ratelimit.ts` (injectable clock for deterministic tests), applied
in the `message` handler: ~10 msg/sec sustained, burst ~30 (well above any
legitimate drag/draw cadence). Separate, tighter bucket for pre-seat `hello`
messages. On exhaustion send `error "slow down"`; close on repeated abuse.
Keep the engine (`engine/`) untouched — the limit lives in the ws layer, which
already uses `Date.now()`.

**Acceptance criteria:** unit tests for the bucket (refill/burst/deny);
flooding one connection at 100 msg/s no longer produces 100 broadcasts/sec;
normal play (rapid card drags, Ctrl+E draw bursts) never hits the limit.

---

### SEC-05 — Medium — No connection or room caps; unbounded room creation

**Evidence** — `ws.ts:51` (`const conns = new Set<Conn>()`, no cap, no per-IP
accounting); room creation on demand `ws.ts:152-157`; started rooms with
everyone disconnected persist up to 1h (`rooms.ts:8`, `ROOM_IDLE_MS`); a deck
can be 1000 cards (`engine/actions/deck.ts:31-37`).

**Attack:** scripted `create` → `LOAD_DECK` (1000 cards) → `START_GAME` →
disconnect, repeated: each room pins ~1000 card objects for an hour; thousands
of rooms exhaust RAM in the single process hosting *all* rooms. Connection
flood works independently (`conns` is unbounded). Note unstarted rooms are
GC'd in ~2 min (`engine/gc.ts`) — the attack specifically uses `START_GAME`.

**Recommended fix:** caps enforced in `wss.on("connection")` and
`handleHello`: `MAX_CONNECTIONS` (default ~300, total), `MAX_CONNECTIONS_PER_IP`
(default ~20 — friends behind NAT), `MAX_ROOMS` (default ~100),
`MAX_ROOMS_PER_IP` (default ~5; requires tracking the creator IP — add a
server-only `creatorIp` field to `Game` in `engine/state.ts`; `Game` never
goes on the wire, `view.ts` builds the wire state, so no protocol change).
Exceeding → send `error` + close (1013). Make the totals env-overridable
(`MAX_ROOMS`, `MAX_CONNECTIONS`) for bigger deployments.

**Acceptance criteria:** connection #301 gets a polite error instead of a
socket; room #101 creation fails with "server is full"; one IP cannot hold
>5 creator-IP rooms or >20 sockets; normal 6-player play never brushes the
limits.

---

### SEC-06 — Medium — Unbounded battlefield growth via repeated CREATE_TOKEN

**Evidence** — `engine/actions/cards.ts:161-200`: `MAX_TOKENS_AT_ONCE = 20`
bounds a single action; no total exists, so `battlefield.push` is unbounded
across actions, and every action re-broadcasts the ever-growing state (SEC-04
multiplies this).

**Attack:** one player holds a keybind/macro: thousands of tokens; snapshots
balloon to megabytes; the table degrades for everyone and the server spends
its CPU serializing them.

**Recommended fix:** in `createToken`, reject when
`actor.zones.battlefield.length + action.count > MAX_BATTLEFIELD_CARDS`
(~250). Error: `"battlefield is full — too many cards"`. (`LOAD_DECK` is
already safe: it replaces zones rather than appending.)

**Acceptance criteria:** test in `actions/cards.test.ts`: creating past the
cap errors and leaves the zone untouched; 20-at-a-time creation below the cap
still works.

---

### SEC-07 — Medium — No security headers, no CSP, poweredByHeader on

**Evidence** — `frontend/next.config.ts:3-5` is the entire config:

```ts
const nextConfig: NextConfig = {
  transpilePackages: ["@mythic/shared"],
};
```

No `headers()`, no `poweredByHeader: false`, no middleware.

**Attack:** (a) **Clickjacking** — no `X-Frame-Options`/`frame-ancestors`, and
the table is a pure pointer-driven UI with destructive confirm dialogs; a
hostile page can iframe `/game/CODE` and steer clicks. (b) **No CSP** —
nothing pins `img-src`/`connect-src`, so nothing structurally constrains where
images/connections can go (matters for SEC-15). (c) `x-powered-by` leaks the
framework. (d) No HSTS for https deployments.

**Recommended fix** (prod-only headers to avoid dev/HMR friction):

```ts
poweredByHeader: false,
async headers() {
  if (process.env.NODE_ENV !== "production") return [];
  return [{ source: "/:path*", headers: [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    { key: "Content-Security-Policy", value:
      "default-src 'self'; img-src 'self' https://cards.scryfall.io data:; " +
      "connect-src 'self' https://api.scryfall.com; style-src 'self' 'unsafe-inline'; " +
      "script-src 'self' 'unsafe-inline'; font-src 'self' data:; " +
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
  ]}];
},
```

(`'unsafe-inline'` for script/style is the pragmatic Next.js-without-nonces
posture; the value here is pinning img/connect origins, which also closes
SEC-15.)

**Acceptance criteria:** `curl -I` on a prod build shows all headers; card
art, Scryfall fetches, and the `/ws` connection still work under the CSP; dev
server unaffected.

---

### SEC-08 — Medium — No TLS story, all-interfaces default binds (dev + compose), docker hardening gaps

**Evidence** — `server/src/index.ts:45` `server.listen(port, …)` with no host
argument → Node binds `::` (all interfaces) in **dev**; `docker-compose.yml:8-9`
`"${MYTHIC_PORT:-3000}:3000"` publishes on all host interfaces; README
deployment section recommends Railway/Fly/Render/VPS with **no mention of TLS
or a reverse proxy**; the rejoin token (the only credential, 122-bit UUID)
travels in the WS handshake in cleartext on http.

**Attack:** on a plain-VPS deployment per the README, anyone on-path sniffs
rejoin tokens and chat, and hijacks seats. On a dev machine, `npm run dev`
exposes Next dev mode (source, stack traces, HMR) plus the game server to the
LAN.

**Recommended fix:**
1. `index.ts`: `server.listen(port, process.env.HOST ?? "127.0.0.1", …)`;
   `Dockerfile` sets `ENV HOST=0.0.0.0` (required for the port mapping).
   Dev defaults to localhost; explicit `HOST=0.0.0.0 npm run dev` opts into LAN.
2. `docker-compose.yml`: `"${MYTHIC_BIND:-127.0.0.1}:${MYTHIC_PORT:-3000}:3000"`,
   plus `security_opt: ["no-new-privileges:true"]` and `cap_drop: ["ALL"]`
   (the app needs no capabilities; port >1024).
3. README deployment section: put the app behind Caddy/nginx with TLS, set
   `TRUST_PROXY=1` (SEC-03), and note `MYTHIC_BIND=0.0.0.0` for direct exposure.
4. (Optional) digest-pin the base image — currently floating `node:22-alpine`.

**Acceptance criteria:** dev `npm run dev` reachable only from localhost
unless `HOST` is set; container still healthy and reachable via the mapping;
README documents the proxy+TLS path.

---

### SEC-09 — Low — close handler and room sweeper run outside the exception guard; no process-level handlers

**Evidence** — the inbound message path is guarded (`ws.ts:106-117`), but the
`close` handler (`ws.ts:119-144`, which calls `broadcast` → `personalize`) and
the sweeper callback (`ws.ts:46-48` via `setInterval` in `rooms.ts:86`) are
not; grep confirms no `process.on("uncaughtException"/"unhandledRejection")`
anywhere.

**Attack:** not directly attacker-triggerable today (all state is
server-built), but any future bug in those paths is an uncaught exception that
kills the single process hosting every room. Blast radius: total outage.

**Recommended fix:** wrap the `close` handler body and the `onSweep` callback
in try/catch (log + continue); add log-only
`process.on("uncaughtException"|"unhandledRejection")` in `index.ts` so a
surprise degrades to a log line instead of a process exit.

**Acceptance criteria:** an injected throw in `close`/sweep is logged and the
server keeps serving other rooms; main() fatal path unchanged.

---

### SEC-10 — Low — Outbound backpressure ignored

**Evidence** — `ws.ts:258-260`:

```ts
function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
```

`ws.bufferedAmount` is never consulted. `maxPayload` bounds inbound only.

**Attack:** join a room, stop reading the socket; the server buffers every
snapshot for that connection in RAM indefinitely (multi-MB per zombie
connection under SEC-04-style load).

**Recommended fix:** in `send`, if `ws.bufferedAmount > 4 MiB`, terminate the
connection (safe during `Set` iteration in `broadcast`).

**Acceptance criteria:** a stalled client is dropped after its buffer exceeds
the threshold instead of growing server RAM; healthy clients unaffected.

---

### SEC-11 — Low — Duplicate display names allowed

**Evidence** — `seat()` (`ws.ts:204-219`) and `cleanName` (`ws.ts:270-273`)
enforce length/whitespace only.

**Attack:** a griefer who knows the room code joins with the host's exact
name; every system/chat line is name-attributed (`"alice joined"`), enabling
fake-host social engineering. Collateral: `BAN_PLAYER` on name "alice"
(`admin.ts:86`) blocks every future "alice".

**Recommended fix:** in the `join` branch, reject case-insensitive name
collisions with seated players: `"that name is already taken at this table"`.

**Acceptance criteria:** joining with an existing seated name (case-insensitive)
fails with that message; distinct names unaffected; rejoin-by-token unaffected.

---

### SEC-12 — Low — `rejoin` does not check the ban list

**Evidence** — `ws.ts:175-200` never calls `isBanned` (unlike `join` at
`ws.ts:169`). Currently harmless only because `BAN_PLAYER` removes the seat
(`admin.ts:84`), so the token lookup fails first — a fragile coupling.

**Recommended fix:** one line in the `rejoin` branch after the player lookup:
`if (isBanned(game, player.name, conn.ip)) return sendError(conn, "you are banned from this table")`.

**Acceptance criteria:** a banned token cannot rejoin even if seat-removal
semantics change later; normal rejoin unaffected.

---

### SEC-13 — Low — Multi-connection close marks a live seat disconnected → lobby GC can evict a connected player

**Evidence** — `ws.ts:127-131`: on `close`, the seat is flagged
`connected = false; disconnectedAt = Date.now()` without checking whether
another connection still holds that seat (multi-socket rejoin is allowed,
`ws.ts:175-199`). `sweepDisconnectedPlayers` (`engine/gc.ts:26-36`) will then
drop the seat after 2 minutes in the lobby while the other socket is alive;
its actions then fail with "you are not seated".

**Recommended fix:** in the `close` handler, skip the disconnect bookkeeping
when `conns` still contains another connection with the same `game` +
`playerId`.

**Acceptance criteria:** with two sockets on one seat, closing one keeps the
seat `connected`; the GC no longer evicts it; single-socket behavior unchanged.

---

### SEC-14 — Low — `decodeURIComponent` on the game route can throw an unhandled 500

**Evidence** — `frontend/src/app/game/[code]/page.tsx:8-9`:

```ts
const { code } = await params;
return <GameClient code={decodeURIComponent(code).toUpperCase()} />;
```

`/game/%ZZ` or truncated escapes throw `URIError` in a server component —
uncaught, so the route 500s instead of showing "bad room code". Crash-only:
the decoded value flows solely into React text, the ws payload, and a
sessionStorage key (all inert contexts).

**Recommended fix:** try/catch with fallback to the raw param (and/or validate
against the room-code regex before rendering).

**Acceptance criteria:** `/game/%ZZ` renders the connecting screen and the
server rejects the join with "room not found" instead of a 500.

---

### SEC-15 — Low (defense-in-depth) — Shallow card-cache validation; Scryfall image URLs rendered unvalidated

**Evidence** — `frontend/src/lib/cardCache.ts:26-29` checks only that
`parsed.byId`/`parsed.nameIndex` exist; every `CardDef` inside is trusted
(`foundation.ts:44-45` calls `def.oracle_text.toLowerCase()`; renderers feed
`def.small`/`def.normal` straight into `<img src>` — `CardSprite.tsx:160` etc.).
`frontend/src/lib/scryfall.ts:143-144` copies `image_uris` verbatim from the
API response into the cache and the DOM.

**Impact:** tampered localStorage can crash the tab (non-string fields) or
point `<img src>` at an arbitrary host (IP/Referer leak). **No script
execution is possible** — React renders these as text/attributes only; zero
HTML sinks exist in the frontend. Attacker-with-localStorage-access already
has XSS-equivalent power, so this is hardening, not a vulnerability. The CSP
from SEC-07 (`img-src … cards.scryfall.io`) makes the leak moot.

**Recommended fix:** optional, on top of SEC-07: validate scheme `https:` on
`small`/`normal` in `toDef` (`scryfall.ts`) and on cache read; deep-validate
`oracle_text`/`name` as strings on cache load (bail to a fresh cache on
mismatch).

**Acceptance criteria:** tampered cache degrades to a re-fetch instead of
crashing; non-scryfall https image URLs are refused by CSP.

---

### SEC-16 — Low (infra) — Docker/compose hardening gaps

**Evidence** — `Dockerfile:2` `ARG NODE_VERSION=22` → floating
`node:22-alpine` (no digest pin); `docker-compose.yml` has no `security_opt`
or `cap_drop`.

**Impact:** supply-chain drift on the base image; the container retains
default capabilities it never needs (the app is RAM-only, no filesystem
writes, no privileges).

**Recommended fix:** folded into SEC-08 item 2/4 (compose flags there);
digest-pin `node:22.x-alpine@sha256:…` if reproducibility matters.

**Acceptance criteria:** `docker compose config` shows `no-new-privileges`
and empty caps; image build reproducible from a pinned digest.

---

## Checked and OK (verified secure)

1. **JSON.parse guarded** per connection (`ws.ts:100-105`); malformed frames
   get an error reply, no crash.
2. **Per-connection exception guard** on the whole dispatch path
   (`ws.ts:106-117`) — a throwing handler degrades to "internal error" for
   that connection only.
3. **Inbound message cap** — `maxPayload: 64 KiB` (`ws.ts:40,66`); `ws`
   closes oversize senders with 1009.
4. **Heartbeat** — 30s ping, terminate after 2 missed pongs, timer
   `unref()`'d (`ws.ts:70-80`).
5. **Upgrade routing** — strictly `pathname === "/ws"` (`ws.ts:53-56`);
   everything else goes to Next's handler (`index.ts:36-43`).
6. **Identity is per-connection and server-side** — `conn.playerId` is set
   only by `seat()`/`rejoin()`; actions execute with `conn.playerId` as actor
   (`ws.ts:221-224`); no action carries an actor id from the client, so
   player impersonation is impossible by construction. Rejoin requires a
   122-bit crypto `randomUUID` token minted by the server (`ws.ts:7,179-182`).
7. **Card ownership enforced on every card action** — `SET_TAPPED`,
   `SET_FACE_DOWN`, `TRANSFORM_CARD`, `SET_POSITION`, `SET_NOTES`,
   `SET_COUNTERS`, `ATTACH_CARD`, `MOVE_CARD`, `MOVE_CARD_INDEX`,
   `DISCARD_*`, `SCRY`, `SURVEIL`, `REVEAL_CARDS` all go through `ownCard`
   (`actions/internal.ts:74-83`), which rejects nonexistent and foreign uids
   identically — you cannot touch, probe, or confirm cards in an opponent's
   hidden zones.
8. **Hidden-zone filtering is sound** — opponents' `hand`/`library`/
   `sideboard` collapse to counts; face-down cards null `cardId` for
   non-owners (`view.ts:17,50-81`); snapshots are personalized per viewer per
   broadcast.
9. **No hidden-info oracle in errors** — "not found" and "not yours" produce
   the same error string; uids are 16 hex chars of crypto RNG (64 bits,
   `state.ts:59-63`), unguessable and non-sequential.
10. **Targeted reveals safe** — audience validated as seated other players;
    `to`-scoped chat delivered only to revealer + named viewers
    (`chat.ts:74-82`, `view.ts:34-39`); revealed ids come from the actor's
    own cards.
11. **Arrows reference public state only** — battlefield uids or seated
    players, capped at 40, pruned when endpoints leave
    (`cards.ts:208-228`, `internal.ts:113-123`).
12. **SCRY/SURVEIL partition validation** — `top`+`bottom` must exactly
    partition the actor's own top-N (`internal.ts:173-196`); no probing below
    the window or of foreign libraries.
13. **Numeric bounds everywhere** — draw ≤ 100, mill ≤ 100, discard ≤ 30,
    mulligan ≤ 99, tokens ≤ 20/action, deck ≤ 250 entries / ≤ 1000 cards,
    life ∈ [-99, 99999], mana keys allowlisted, counters ≤ 12 kinds /
    values 0-999, notes ≤ 8 × 100 chars, chat ≤ 500 chars / 200-message ring,
    reveal ≤ 30, positions clamped 0-100, dice sides allowlisted.
14. **Host gating centralized and race-free** — `requireHost` on END_GAME /
    KICK / BAN (`admin.ts:29,61,79`); self-kick/ban rejected; host transfer
    reassigns synchronously in single-threaded dispatch (`state.ts:88-99`);
    kicked/banned players' sockets are found and closed with a reason
    (`ws.ts:233-245`).
15. **No prototype pollution** — no user-keyed writes into state; zone keys
    come from a constant; `SET_MANA` allowlists keys before spreading;
    `SET_COUNTERS` builds fresh objects with integer-checked values; no
    deep-merge of client JSON anywhere.
16. **Room lifecycle GC exists** — 60s sweeper, 1h idle deletion, 2-min
    lobby seat sweep, immediate teardown on last leave, collision-safe code
    generation.
17. **No dangerous APIs** — no `eval`/`new Function`/`child_process`/`fs`/
    secrets in `server/src` or `shared/src`; server makes zero outbound HTTP
    calls; crypto use is `randomUUID`/`randomInt` only.
18. **RNG is server-authoritative and crypto-backed** — shuffles, random
    discard, dice, ids all via `ctx.rng` (node:crypto); the seedable
    `mulberry32` exists for tests only and is never used in the server path.
19. **Frontend is injection-free** — zero `dangerouslySetInnerHTML`/
    `innerHTML`/`insertAdjacentHTML`/`document.write`; chat, names, notes,
    counters render as React text; no dynamic `href`/`target=_blank`/
    `postMessage`; no regex built from user input (no ReEvil/ReDoS); ws URL
    is same-origin by construction; sessionStorage token is sent only in the
    rejoin frame; `encodeURIComponent` on all Scryfall query interpolation;
    no secrets/env files anywhere (repo or git history); no console logging
    of sensitive data.
20. **Dependencies clean** — `npm audit --omit=dev`: 0 vulnerabilities
    (prod graph: 27 packages). Lockfile v3 committed, `npm ci` in Docker,
    only esbuild/fsevents/unrs-resolver carry install scripts, all
    integrity-pinned. Non-root multi-stage image, dev deps never in runtime,
    healthcheck present, `.dockerignore` excludes `.env*`.

## Accepted by design (documented, no action)

- `CLEAR_ARROWS` is open to any player ("anyone may clear" per AGENTS.md).
- The owner sees their own library in full order (stacking is possible;
  that's what `SHUFFLE_LIBRARY` is for) — trust-the-players model.
- Face-down cards keep their owner-authored annotation text visible; face-down
  cards moved to graveyard/exile reveal their `cardId` (matches MTG rules).
- `START_GAME` / `NEXT_TURN` / `SET_PHASE` are open to any seated player
  (documented in the design doc).
- Kick allows instant rejoin; bans are name+IP only and rotatable — accepted
  limitation of an accountless casual server (the *spoofable* IP half is
  SEC-03, which is a real bug).
- Names/chat pass arbitrary unicode through (length-capped); safe under React
  rendering. RTL-override spoofing of chat text is theoretically possible but
  low-value here.
- Action-handler registry resolves through the prototype chain for weird
  `action.type`s ("constructor" etc.) — no write path, caught by the
  connection guard; informational.
- Production runs TS source via tsx and the image ships source — deliberate
  (AGENTS.md), no secrets in tree.

## Dependency table (prod graph)

| Package | Locked | Notes |
|---|---|---|
| next | 16.3.1 | both server + frontend |
| react / react-dom | 19.2.8 | |
| ws | 8.21.3 | current, no known relevant CVEs |
| tsx | 4.23.12 | prod (runs source) |
| esbuild | 0.28.2 | via tsx; postinstall, lockfile-pinned |
| lucide-react | 1.33.0 | |
| typescript | 5.9.3 | dev |
| tailwindcss | 4.3.3 | dev |

`npm audit` (prod): **0 vulnerabilities**.

## Issue mapping (filed 2026-08-22)

| Issue | Covers | Priority |
|---|---|---|
| Room codes: entropy + join throttling | SEC-01 | P1 |
| WS Origin check | SEC-02 | P2 |
| XFF / TRUST_PROXY | SEC-03 | P2 |
| Rate limiting | SEC-04 | P2 |
| Connection/room caps | SEC-05 | P2 |
| Battlefield/token cap | SEC-06 | P2 |
| Security headers/CSP (+ cache/image hardening note) | SEC-07, SEC-15 | P2 |
| TLS guidance + bind defaults + docker hardening | SEC-08, SEC-16 | P2 |
| Crash guards + backpressure | SEC-09, SEC-10 | P3 |
| Edge-case batch (names, rejoin ban, close race, decode 500) | SEC-11…14 | P3 |
