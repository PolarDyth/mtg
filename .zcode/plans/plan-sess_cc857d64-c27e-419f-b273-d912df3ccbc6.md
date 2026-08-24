# CI Workflow for Mythic Table (`PolarDyth/mtg`, private repo)

First CI in the repo — today nothing runs checks automatically; everything is
enforced by the local `npm test` / `npm run build` / `npm run lint` scripts.
The design maps those existing scripts 1:1 onto GitHub Actions jobs (no script
changes needed), adds the two protocol e2e scripts as an integration job, and
validates the production Docker image on every PR.

## Files to create

```
.nvmrc                          # "22" — matches Dockerfile ARG NODE_VERSION; single source for setup-node
.github/workflows/ci.yml        # lint / test / build / e2e / docker jobs (PR + push to main)
.github/dependabot.yml          # weekly npm + github-actions + docker updates, grouped
.github/pull_request_template.md
```

One edit: `AGENTS.md` Commands section gains a CI paragraph.

## 1. `.github/workflows/ci.yml`

- **Triggers:** `pull_request` + `push: branches: [main]` (no duplicate runs for
  in-repo PRs; merged PRs get one main run). No path filters — keeps required-
  check semantics simple.
- **Concurrency:** per-ref group, `cancel-in-progress` on PRs only.
- **Node:** `actions/setup-node@v5` with `node-version-file: .nvmrc`,
  `cache: npm` (root `package-lock.json` covers all three workspaces via one
  `npm ci`).
- **Jobs (all `ubuntu-latest`):**

| job | runs | notes |
|---|---|---|
| `lint` | `npm ci` → `npm run lint` | frontend eslint (only lint config that exists — server lint stays out of scope) |
| `test` | `npm ci` → `npm test` | server engine tests + frontend pure tests, sequential as at root |
| `build` | `npm ci` → `npm run build` | `next build` + server `tsc --noEmit` — the repo's typecheck gate |
| `e2e` (`needs: build`) | `npm ci` → `npm run build` → boot server → run e2e scripts | integration: real WebSocket protocol |
| `docker` | buildx build, `push: false`, gha layer cache | validates the exact image `docker compose up` deploys |

- **e2e job mechanics** (the one nontrivial part): `NODE_ENV=production npm start > server.log 2>&1 &`
  (background bash), then poll `curl -sf http://127.0.0.1:3000/` every 2s up
  to 120s (server entry: `dev = NODE_ENV !== "production"`, and prod-mode
  `app.prepare()` serves the prebuilt `.next`), then
  `node server/scripts/e2e-m2.js && node server/scripts/e2e-reveal-to.js`.
  On failure: dump `server.log` in the step output (private repo — no secrets
  risk; simpler than artifacts). `if: always()` kill step. `timeout-minutes: 15`
  so a hung server can't burn Actions minutes. Dev deps are installed (plain
  `npm ci`) since `npm start` needs `tsx`.
- `NEXT_TELEMETRY_DISABLED=1` at workflow level (matches Dockerfile).
- Per-job `timeout-minutes`: lint 5, test 10, build 15, e2e 15, docker 20.

## 2. `.github/dependabot.yml`

Three ecosystems, weekly, all grouped to avoid PR spam:
- `npm` at `/` (Dependabot handles the workspaces root lockfile) — group minor+patch.
- `github-actions` at `/`.
- `docker` at `/` (base-image bumps for `node:22-alpine`).

## 3. `.github/pull_request_template.md`

Short checklist drawn from the repo's own conventions (AGENTS.md rules):
- shared contract changed → handlers registered (tsc enforces), contract-reviewed
- `CardDef` shape changed → bump `mtg:cards:vN` cache version
- new game mechanic → keybind wired (id + labels + groups + slice + escape chain)
- tests colocated; docs/AGENTS.md updated if architecture changed

## 4. `AGENTS.md` edit (Commands section, after the focused-typecheck paragraph)

One paragraph: CI runs on PRs + main via `.github/workflows/ci.yml`
(lint/test/build/e2e/docker); e2e boots `NODE_ENV=production npm start` and runs
both `server/scripts/e2e-*.js`; keep `.nvmrc` in sync with the Dockerfile's
`ARG NODE_VERSION`.

## 5. Branch protection on main (after first green run)

Checks must exist on main before they can be required, so this is a separate
final step via `gh api` (classic branch protection, PRs required with
**0** approving reviews — right for a solo repo: blocks direct pushes, no
self-approval dance):

```
gh api -X PUT repos/PolarDyth/mtg/branches/main/protection --input - <<'EOF'
{ "required_status_checks": { "strict": true,
    "contexts": ["lint", "test", "build", "e2e", "docker"] },
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "enforce_admins": true, "restrictions": null,
  "allow_force_pushes": false, "allow_deletions": false }
EOF
```

If the API rejects `0`-approval reviews, fall back to a repository ruleset with
`pull_request` + `required_status_checks` rules instead.

## Execution order

1. Branch `ci/pr-checks` from `origin/main` (current `security-patch` working
   tree is left untouched; only the new files + AGENTS.md edit get committed).
2. Write the four new files + AGENTS.md edit.
3. Local sanity: `npm run lint && npm test` (fast; build is covered by CI on the PR).
4. Commit (`ci: add GitHub Actions workflow (lint/test/build/e2e/docker), dependabot, PR template`),
   push, open PR to main.
5. **Verify all 5 jobs green on that PR** — e2e is the one to watch (first time
   these scripts run on Linux; they're plain CommonJS + `ws`, no Windows-isms).
6. Merge → wait for the main-branch run to go green → apply branch protection →
   verify with `gh api repos/PolarDyth/mtg/branches/main/protection`.

## Acceptance criteria

- A PR with all five checks green (screenshot-level proof: the PR's checks tab).
- Deliberate-break sanity: pushing a failing test to the PR branch turns `test`
  red (spot-check once, then revert).
- `.nvmrc` == Dockerfile `NODE_VERSION` (22).
- Branch protection returns the config above; a red check blocks the merge button.
- Dependabot config accepted (first `chore(deps)` PRs arrive within a week);
  PR template renders on new PRs.

## Out of scope (noted, not built)

- Server/shared eslint configs (no config exists today — root lint is frontend-only by design).
- GHCR publishing (deploy is local `docker compose`; revisit if that changes).
- Docker *run* smoke test in CI (healthcheck boot check — cheap follow-up if wanted).
- Any change to test/build scripts themselves — CI consumes them verbatim.