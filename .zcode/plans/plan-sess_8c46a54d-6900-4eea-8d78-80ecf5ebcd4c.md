# Security Audit Remediation — P1 + P2 (issues #51–#58)

Fix the 2026-08-22 security audit findings in priority order, as **two PRs** (3-tier structure reduced to 2 because scope is #51–#58): PR 1 = #51 (P1), PR 2 = #52–#58 (P2 network edge). PR 3 (#59–#60, P3) is explicitly **out of scope this pass**. Both optional hardening items (SEC-15 cache/image validation, digest pin) are **included**.

**No `shared/src` changes** — the wire protocol is untouched (`creatorIp` is a server-only field; room-code format isn't typed in shared) → no contract review needed. CardDef shape unchanged → **no cache version bump**.

---

## 0. Pre-flight: land PR #50 (CI)

1. `gh pr checks 50` — if green, `gh pr merge 50 --merge` (repo uses merge commits). If red, report back before proceeding.
2. `git checkout main && git pull` in the local repo.
3. Working-tree hygiene: there is unrelated noise (3 unstaged deletions of root `2026-*.md` files + untracked `.zcode/plans/*`). **Never `git add -A`** — stage explicit paths only in every commit.
4. Before any e2e run: check :3000 for an orphaned dev server (AGENTS.md gotcha — kill PID via `taskkill /PID <pid> /T /F` if "another next dev server" errors).

---

## PR 1 — branch `fix/sec-01-room-codes` (Closes #51)

New room codes: `WORD-WORD-1234` (66² × 10⁴ ≈ 32 bits, format approved by user) + failed-join throttling.

### Files changed

**`server/src/rooms.ts`**
- `freshCode()` → two independent word draws + 4 digits: `${w1}-${w2}-${String(number).padStart(4, "0")}` (existing collision loop in `create()` already handles the rarer repeats).
- `isValidCode()` regex → `/^[A-Z]+-[A-Z]+-\d{4}$/` (old single-word codes rejected; rooms are RAM-only, no migration).

**`server/src/ratelimit.ts` (NEW)** — pure limiting primitives, no IO, injectable time (matches the engine's determinism ethos; lives at ws layer):
```ts
export class HitWindow {
  constructor(windowMs: number)
  hit(at: number): void          // record a timestamp
  count(at: number): number      // prune expired + return live count
}
// (TokenBucket joins this module in PR 2)
```

**`server/src/ratelimit.test.ts` (NEW)** — HitWindow tests: counts within window, prunes expired entries, boundary at exactly `windowMs`.

**`server/src/ws.ts`** — failed-join throttling in the `join` branch:
- Constants: `JOIN_FAIL_CONN_LIMIT = 5` / `JOIN_FAIL_CONN_MS = 10_000`; `JOIN_FAIL_IP_LIMIT = 10` / `JOIN_FAIL_IP_MS = 60_000`.
- `Conn` gains `joinFails: HitWindow`; module-level `const ipJoinFails = new Map<string, HitWindow>()`.
- At branch entry: if per-IP window count ≥ 10 → `sendError(conn, "too many join attempts — wait a minute")` and return (temporary rejection; window slides). Prune empty Map entries during the check.
- Every failed join outcome (bad format / room not found / room full / banned) routes through a `failJoin(conn, msg)` helper that records both windows; after recording, if per-conn count **> 5** within 10s → `sendError` + `conn.ws.close(1008, "too many failed joins")`.
- Successful seat resets the conn's window.

**`frontend/src/app/page.tsx`** — regex at :65 → `/^[A-Z]+-[A-Z]+-\d{4}$/`; error text :66 → `"Room codes look like RAVEN-STORM-4821"`; placeholder :142 → `RAVEN-STORM-4821`.

**`server/scripts/e2e-m2.js`** — :82 welcome-code regex → `/^[A-Z]+-[A-Z]+-\d{4}$/`; :187 hard-coded `"NOSUCH-9999"` → `"NOSUCH-CODE-9999"` (valid new format, nonexistent → still asserts `"room not found"`).

**`server/src/rooms.test.ts`** — new `describe("room codes")`: `isValidCode` accepts `RAVEN-STORM-4821` (and lowercased, since `normalizeCode` uppercases), rejects old format `RAVEN-4821`, rejects short numbers `RAVEN-STORM-42`; `create()` returns a code matching the new regex.

**`README.md`** — update the room-code example (~L8, `PLAINS-42` → `RAVEN-STORM-4821`).

### Verification
`npm test`, `npx tsc --noEmit` (server + frontend), `npm run lint`, then `npm run build && NODE_ENV=production npm start` and `node server/scripts/e2e-m2.js` + `node server/scripts/e2e-reveal-to.js`. Push, open PR, confirm all five CI checks green, merge.

---

## PR 2 — branch `fix/sec-02-08-network-edge` off updated main (Closes #52, #53, #54, #55, #56, #57, #58)

### #52 — WS Origin check
**`server/src/netguard.ts` (NEW)** + `netguard.test.ts`:
```ts
export function originAllowed(origin: string | undefined, host: string | undefined,
  extraOrigins: readonly string[]): boolean
```
Missing Origin → allow (curl / ws-npm e2e clients send none). `Origin: null` → deny. Parse via `new URL` (throw → deny); allow if `url.host === host` (case-insensitive, port included) or `url.origin` matches an `ALLOWED_ORIGINS` entry.
**`ws.ts`**: parse `ALLOWED_ORIGINS` env (comma-split) once; in `handleGameUpgrade`, on failure write raw `HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n` + `socket.destroy()` before `wss.handleUpgrade`.

### #53 — TRUST_PROXY / XFF
**`netguard.ts`**:
```ts
export function resolveClientIp(req: { headers: IncomingHttpHeaders; socket: { remoteAddress?: string } },
  trustedHops: number): string | undefined
```
`hops ≤ 0` → `remoteAddress` (forged XFF ignored). `hops = n ≥ 1` → n-th XFF entry **from the right** (`list[list.length - n]`); handles string + string[] header forms; missing/short list → `remoteAddress`. Invalid/NaN/negative env → 0.
**`ws.ts`**: `const TRUST_PROXY = envInt("TRUST_PROXY", 0)`; `clientIp()` delegates to `resolveClientIp`. Tests cover: default ignores forged XFF; `TRUST_PROXY=1` takes rightmost; multi-hop; array-form header.

### #54 — per-connection rate limiting
**`ratelimit.ts`** adds:
```ts
export class TokenBucket {
  constructor(capacity: number, refillPerSecond: number, now: () => number)
  tryTake(tokens?: number): boolean
}
```
**`ratelimit.test.ts`**: burst = capacity, sustained refill rate, deny when empty, recovery over time (injected clock).
**`ws.ts`**: `Conn` gains `bucket = new TokenBucket(30, 10, Date.now)` + `helloBucket = new TokenBucket(5, 1, Date.now)` + a `strikes` HitWindow (60s). In the message handler before dispatch: `if (!conn.bucket.tryTake())` → `sendError(conn, "slow down")`, record strike, ≥5 strikes/min → `close(1008)`. Pre-seat `hello` path additionally gated by `helloBucket`. Engine untouched. (e2e scripts send ~14 wait-paced messages — far under the limits; verified in recon.)

### #55 — connection & room caps
**`server/src/engine/state.ts`**: `Game` gains `creatorIp?: string` (server-only — `view.ts`/`playerView` build wire objects field-by-field and never touch it; add one `view.test.ts` assertion that a personalized snapshot's JSON contains no `creatorIp`).
**`rooms.ts`**: `create(creatorIp?: string)` sets the field; add `count(): number` and `countByCreatorIp(ip): number`.
**`ws.ts`**: `envInt` helper; `MAX_CONNECTIONS = envInt("MAX_CONNECTIONS", 300)`, `MAX_ROOMS = envInt("MAX_ROOMS", 100)`; constants `MAX_CONNECTIONS_PER_IP = 20`, `MAX_ROOMS_PER_IP = 5`. In the connection handler (ip computed first): over total or per-IP cap → send `{type:"error", message:"server is busy — try again later"}` + `close(1013)` without adding to `conns`. In the `create` branch: `rooms.count() >= MAX_ROOMS` → `"server is full — try again later"`; `conn.ip && rooms.countByCreatorIp(conn.ip) >= MAX_ROOMS_PER_IP` → `"too many rooms created from your network"`.

### #56 — battlefield cap
**`server/src/engine/actions/internal.ts`**: `export const MAX_BATTLEFIELD_CARDS = 250;` (beside `MAX_TOKENS_AT_ONCE`).
**`engine/actions/cards.ts`** `createToken`, after count validation: `if (actor.zones.battlefield.length + action.count > MAX_BATTLEFIELD_CARDS) return err("battlefield is full — too many cards");` (cap inclusive — 250 total allowed; push happens after, zone untouched on error).
**`engine/actions/cards.test.ts`**: boundary tests — at 249 cards, 1 token ok / 2 tokens err with zone length unchanged; 20-at-a-time creation below cap still works.

### #57 — security headers + CSP (+SEC-15)
**`frontend/next.config.ts`**: `poweredByHeader: false` + prod-only `headers()` exactly as in issue #57 (nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, HSTS, CSP: `default-src 'self'; img-src 'self' https://cards.scryfall.io data:; connect-src 'self' https://api.scryfall.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`). Verified in recon: fonts self-host via `next/font` (font-src 'self' ok); ws is same-origin (covered by connect-src 'self').
**`frontend/src/lib/scryfall.ts`**: add `httpsUrl(u: unknown): string | null` (string + `new URL` + `protocol === "https:"`); `toDef` and `backOf` require valid https `small`/`normal` else return null. Extend `scryfall.test.ts`: http:// image URL → `toDef` null.
**`frontend/src/lib/cardCache.ts`**: extract pure `sanitizeCache(parsed): CacheShape` — deep-checks each `byId` entry (name/id strings, oracle_text string, small/normal https strings) and nameIndex values; any failure → return empty (fresh cache, re-fetch from Scryfall). Wire into `readCache`. **No version bump.** New `cardCache.test.ts` for the pure function.

### #58 — bind defaults + docker hardening + TLS guidance (+digest pin)
- **`server/src/index.ts`**: `server.listen(port, process.env.HOST ?? "127.0.0.1", …)`.
- **`Dockerfile`**: add `HOST=0.0.0.0` to the runtime ENV block; digest-pin the base — `ARG NODE_DIGEST=sha256:<resolved>` (via `docker manifest inspect node:22-alpine` at implementation time), base refs become `node:${NODE_VERSION}-alpine@${NODE_DIGEST}`. Keep `ARG NODE_VERSION` (AGENTS.md: stays in sync with `.nvmrc`). If digest resolution fails on this machine, skip the pin and note it in the PR.
- **`docker-compose.yml`**: ports → `"${MYTHIC_BIND:-127.0.0.1}:${MYTHIC_PORT:-3000}:3000"`; add `security_opt: ["no-new-privileges:true"]`, `cap_drop: ["ALL"]`.
- **`README.md`** deployment section: reverse proxy + TLS path (short Caddy example), `TRUST_PROXY=1` behind a proxy, `MYTHIC_BIND=0.0.0.0` / `HOST=0.0.0.0` for direct exposure, and the new env knobs (`ALLOWED_ORIGINS`, `MAX_CONNECTIONS`, `MAX_ROOMS`).

### Verification (PR 2)
1. `npm test` (new suites: netguard, ratelimit, cards cap, scryfall, cardCache, view creatorIp), `tsc --noEmit` both sides, `npm run lint`, `npm run build`.
2. Boot prod (`NODE_ENV=production npm start`): `curl -I http://127.0.0.1:3000/` shows all headers, no `x-powered-by`; both e2e scripts pass (no Origin header → allowed; pacing under rate limits; 3 conns / 2 rooms under caps).
3. Browser smoke (fresh tab, per env quirks): home page → create room (new code format shows), card art loads (img-src), Scryfall fetches work (connect-src), gameplay ws connects. Dev server (`npm run dev`) unaffected (headers are prod-only).
4. Docker: `docker compose config` shows `no-new-privileges` + empty caps + 127.0.0.1 bind; `docker compose up -d --build` → healthy + reachable via the mapping; then `docker compose down`.
5. Dev default check: `npm run dev` binds 127.0.0.1 only.

Push, PR, watch the five CI checks, merge when green. Issues #52–#58 auto-close via the PR body.

---

## Risks / mitigations
- **CSP breakage** → headers enumerated against actual app needs in recon (Scryfall img/connect, self-hosted fonts, same-origin ws); verified in browser before merge; prod-only so dev is untouched.
- **Rate limit vs legit play** → 30-burst / 10 rps is several× any human cadence (drags drop one message each); e2e + manual smoke confirm.
- **HOST default change** → intended hardening; README documents the opt-in (`HOST=0.0.0.0` / compose `MYTHIC_BIND=0.0.0.0`); CI e2e curls 127.0.0.1 → unaffected.
- **PR #50 checks not green** → stop and report rather than force anything.

## Out of scope (later pass)
#59 (crash guards + backpressure) and #60 (duplicate names, rejoin ban check, multi-socket close race, decode 500) remain open P3s.