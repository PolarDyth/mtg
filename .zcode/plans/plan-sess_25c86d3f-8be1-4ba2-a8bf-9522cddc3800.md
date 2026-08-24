# Security Audit — Report-Only Delivery (branch `security-patch`, no code changes)

## Audit result (TLDR)

Three parallel audit passes (server/engine+shared, frontend, infra/deps) plus manual verification of every cited file. **The core game engine is sound**: per-viewer hidden-info filtering, card-ownership checks, crypto-random ids/tokens, bounded loops, no prototype pollution, no dangerous APIs, no secrets anywhere (including git history), `npm audit` prod = **0 vulnerabilities**, clean multi-stage non-root Docker image.

The real risk is concentrated at the **network edge** — 16 genuine findings:

| # | Sev | Finding | Evidence |
|---|-----|---------|----------|
| SEC-01 | High | Room codes = ~19.3 bits (66 words × 10⁴) with unthrottled joins → active rooms found by enumeration; room code is the *only* access control | `server/src/rooms.ts:90-94`, `ws.ts:159-174` |
| SEC-02 | Med-High | No Origin validation on WS upgrade → any website can silently drive the server from a visitor's browser (enumerate/create rooms, evade IP bans) | `ws.ts:58-64` |
| SEC-03 | Med | `X-Forwarded-For` trusted unconditionally, first hop → IP bans spoofable/bypassable, arbitrary IPs framable | `ws.ts:275-282` |
| SEC-04 | Med | No rate limiting; every accepted action re-broadcasts personalized full snapshots to every seat → cheap CPU/bandwidth amplification DoS | `ws.ts:97-117, 251-256` |
| SEC-05 | Med | No connection or room caps → RAM exhaustion (1000-card START_GAME rooms pinned 1h each; connection flood; unbounded room creation) | `ws.ts:51, 152-157`, `rooms.ts:8` |
| SEC-06 | Med | Unbounded battlefield growth via repeated `CREATE_TOKEN` (20/action, no total cap) → ever-growing snapshot bloat | `engine/actions/cards.ts:161-200` |
| SEC-07 | Med | No security headers/CSP, `poweredByHeader` on → clickjacking of the drag-heavy UI, no img/connect origin pinning | `frontend/next.config.ts:3-5` |
| SEC-08 | Med | No TLS/reverse-proxy story anywhere; compose + dev both bind all interfaces → rejoin tokens/chat in cleartext if deployed per README's VPS/Railway guidance | `index.ts:45`, `docker-compose.yml:8-9`, README |
| SEC-09 | Low | `close` handler + room sweeper callback run outside the per-connection guard; no process-level `uncaughtException`/`unhandledRejection` handlers → one throw kills all rooms | `ws.ts:119-144, 46-48` |
| SEC-10 | Low | Outbound backpressure ignored (`bufferedAmount` never checked) → slow-reader clients buffer unbounded snapshots in RAM | `ws.ts:258-260` |
| SEC-11 | Low | Duplicate display names allowed → host impersonation / social engineering; collateral name bans | `ws.ts:204-219` |
| SEC-12 | Low | `rejoin` path skips `isBanned` (fragile defense-in-depth gap) | `ws.ts:175-200` |
| SEC-13 | Low | Multi-connection close marks a still-connected seat disconnected → lobby GC can evict a live player | `ws.ts:127-131` |
| SEC-14 | Low | `decodeURIComponent` on `/game/[code]` can throw → unhandled 500 on malformed link | `app/game/[code]/page.tsx:8-9` |
| SEC-15 | Low | Shallow cardCache validation + unvalidated Scryfall image URLs (defense-in-depth; CSP in SEC-07 makes moot) | `lib/cardCache.ts:26-29`, `lib/scryfall.ts:143-144` |
| SEC-16 | Low | Docker/compose hardening: floating `node:22-alpine` tag, no `no-new-privileges`/`cap_drop` | `Dockerfile:2`, `docker-compose.yml` |

**By design / no action** (documented in report): `CLEAR_ARROWS` open to all (AGENTS.md), owner sees own library order, face-down annotation text visible to all, `START_GAME`/`NEXT_TURN` open to any seated player, kick-rejoin, unicode names/chat (React rendering is injection-safe — zero HTML sinks verified).

**Fix recommendation baked into the report** (user-approved): SEC-01 → `WORD-WORD-1234` format (66² × 10⁴ ≈ 32 bits) + failed-join throttling. Each finding gets a concrete recommended fix with files to touch and acceptance criteria, so a future implementation pass can execute directly.

## Deliverables

### 1. Full report — `.zcode/plans/2026-08-22-security-audit.md`
Follows the repo's established doc location. Contents: executive summary → methodology → findings SEC-01…16 (severity, file:line evidence with quoted code, attack scenario, recommended fix + acceptance criteria) → verified-secure checklist (~19 items) → accepted-by-design list → dependency table.

### 2. GitHub issues via `gh` CLI (MCP token is read-only — gh is authed as PolarDyth)
First `gh label list`; create `type:security` and `source:security-audit` labels if absent; reuse existing `area:*`, `P1-P3`, `size:*` conventions. Ten issues:

1. **Room codes: ~19 bits entropy + unthrottled joins allow enumeration** — P1, area:server, size:M (fix: WORD-WORD-1234 + join throttle)
2. **No WebSocket Origin check (CSWSH surface)** — P2, area:server, size:S
3. **X-Forwarded-For trusted unconditionally — spoofable IP bans** — P2, area:server, size:S
4. **No rate limiting; full-snapshot broadcast amplification** — P2, area:server, size:M
5. **No connection/room caps — RAM exhaustion** — P2, area:server, size:M
6. **Unbounded battlefield growth via CREATE_TOKEN** — P2, area:server, size:S
7. **No security headers / CSP / poweredByHeader** (+ SEC-15 note) — P2, area:frontend, size:S
8. **No TLS guidance + all-interfaces default binds (dev, compose) + docker hardening** (SEC-08+16) — P2, area:infra, size:M
9. **Crash guards: close/sweeper try-catch, process handlers, WS backpressure** (SEC-09+10) — P3, area:server, size:S
10. **Edge-case batch: duplicate names, rejoin ban check, multi-conn close race, decodeURIComponent 500** (SEC-11…14) — P3, area:server+frontend, size:M

Each body: evidence file:line, attack scenario, recommended fix, acceptance criteria, link back to the report.

### 3. Memory update
New memory `security-audit-2026-08-22.md` (project): audit done 2026-08-22, report-only per user choice, report path, issues filed, user-locked fix choice WORD-WORD-1234, none implemented yet. + `MEMORY.md` index line.

### Explicitly NOT done
No source modifications, no commits, no pushes — `git status` stays clean apart from the untracked report file.

## Acceptance criteria
- Report file exists and covers all 16 findings + verified-secure + by-design sections with file:line evidence.
- `gh issue list` shows the 10 issues with correct labels (P1×1, P2×7, P3×2).
- No tracked files modified (`git status` clean of modifications).