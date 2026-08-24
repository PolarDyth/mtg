Create 3 GitHub issues in **PolarDyth/mtg** for the reported mana bugs (late round-4 playtest feedback, source label `playtest-r4`).

## Preflight (already verified)
- gh 2.85.0, authenticated as **PolarDyth** on github.com (active account, repo scope); repo resolved to `PolarDyth/mtg`.
- All needed labels exist (`bug`, `enhancement`, `frontend`, `scryfall-data`, `P2`, `P3`, `size-S`, `size-M`, `playtest-r4`) — no label creation required.
- Duplicate check done: #21 (Mana Pool) and #22 (Transform cards) are the closed parent features; these are follow-up bugs on their shipped implementation, so new issues are correct.
- Root causes confirmed in code (details embedded in each issue body):
  - Amount bug: `manaAfterTap` (`frontend/src/components/game/table/foundation.ts:123-137`) credits +1 per *distinct* symbol. Verified against live Scryfall data: Sol Ring's `produced_mana` is `["C"]` (distinct only — the code comment's `["C","C"]` premise is wrong); amounts live only in `oracle_text` ("{T}: Add {C}{C}"). Also overcounts any-color lands (City of Brass → 5 mana).
  - DFC bug: `tapForMana` (`useManaPool.ts:59`) gates on top-level `produced_mana` (union across faces), ignores `card.showBack`; `GameTable.tsx:90` passes the raw def, not `faceDef(def, card.showBack)`. Verified Scryfall provides **no per-face** `produced_mana` (Emeria's Call // Emeria, Shattered Skyclave: top-level `["W"]`, neither face carries its own), so the fix must derive per-face data from each face's oracle text (→ `CardBack` extension + card-cache version bump).
- The rumored "tap an opponent's card credits your pool" path is **unreachable** (opponent cards get the reduced menu before the Tap item renders, `ContextMenu.tsx:287`) — not filed, per your decision.

## Issues to file (in order, so C can reference A's number)

### Issue A — the amount bug
- **Title:** `Tapping a multi-mana producer adds the wrong amount to the mana pool`
- **Labels:** `bug, frontend, scryfall-data, P2, size-M, playtest-r4`
- **Body:**

  **Player report:** "Tapping something that would generate more than one mana does not reflect on the mana counter."

  `manaAfterTap` (`frontend/src/components/game/table/foundation.ts:123-137`) is a deliberate distinct-symbol heuristic: tapping a card with non-empty `produced_mana` adds **+1 of each distinct symbol** it lists. But Scryfall's `produced_mana` carries colors only, never amounts — verified against the API: Sol Ring returns `["C"]` while its oracle text says "{T}: Add {C}{C}" (the code comment's "Sol Ring's `["C","C"]` dedupes to one C" premise is wrong about the data). Consequences in both directions:

  - Sol Ring / Grim Monolith / any "Add {C}{C}" producer banks **1 instead of 2+** (the reported undercount)
  - City of Brass / Mana Confluence ("Add one mana of any color") list all five symbols → banks **5** mana (overcount)

  Both trace to the same missing data: the amount exists only in the card's oracle text.

  **Plan:** parse the tapped card's oracle text. Add `oracle_text` to `CardDef` (`frontend/src/lib/scryfall.ts`, cache-version bump in `cardCache.ts` per the scryfall-data convention), parse "Add {C}{C}"-style patterns, and credit that amount. Anything the parser can't resolve ("Add X mana", Nykthos-style, "one mana of any color") falls back to the current +1-per-distinct-symbol behavior (documented as a fallback — the pips remain the manual correction). Keep the parse pure in `foundation.ts` with colocated tests.

  **Acceptance:** tapping an untapped Sol Ring banks 2 colorless; tapping a City of Brass banks 1 of a single color (fallback), not 5; "Add {G}{U}" duals (e.g. Simic Signet) bank one G and one U; unit tests cover fixed amounts, any-color, and unparseable text.

  *Follow-up to #21 (Mana Pool).*

### Issue B — the auto-clear option
- **Title:** `Option to auto-clear the mana pool on phase change`
- **Labels:** `enhancement, frontend, P3, size-S, playtest-r4`
- **Body:**

  **Player report:** "Add an option to enable/disable clearing mana on phase change."

  Today the pool never auto-empties — by design (`SET_MANA`'s contract comment in `shared/src/index.ts` says "nothing auto-empties it"; the engine never drains pools on `SET_PHASE`/`NEXT_TURN`; clearing is manual via Alt+C / the X button in `ManaBar.tsx`). Paper MTG empties mana pools at each step/phase change, so players tracking floating mana have to clear by hand every phase.

  **Plan:** a client preference (e.g. `mtg:auto-clear-mana` in `frontend/src/lib/settings.ts`, default **off** = current behavior). When enabled, the client commits an empty pool for itself when the phase/turn advances. Wiring options, to decide at implementation: (a) client-side — the mana hook watches snapshots for phase/turn changes and sends `SET_MANA` empty (no protocol change; preferred), or (b) server-side per-player flag (protocol addition; authoritative but widens the contract). Manual clear and the pips stay as-is.

  **Acceptance:** with the setting off, nothing changes; with it on, advancing to any new phase (including end-of-turn `NEXT_TURN`) empties my pool for everyone; opponents' pools are untouched; the choice persists across reloads.

### Issue C — the DFC face-blind bug (body references A's new number `<A#>`)
- **Title:** `Tapping a DFC on its front face still banks its back face's mana`
- **Labels:** `bug, frontend, scryfall-data, P2, size-S, playtest-r4`
- **Body:**

  **Player report:** "Tapping a card that can be transformed into a land causes mana to be added; only if the card is on its transformed side that would produce mana should it produce mana."

  `tapForMana` (`frontend/src/components/game/table/hooks/useManaPool.ts:59`) gates on the **top-level** `def.produced_mana` — which for double-faced cards is effectively the union across faces — with no reference to `card.showBack`. `GameTable.tsx:90` compounds it by passing the raw cache def (`get(card.cardId)`) instead of `faceDef(def, card.showBack)`. And a real fix can't just read a face-scoped field: Scryfall provides **no per-face** `produced_mana` (verified: Emeria's Call // Emeria, Shattered Skyclave reports top-level `["W"]`; neither face carries its own), so per-face mana data must be derived from each face's oracle text/type line and captured in `CardBack` (`scryfall.ts:36-42` currently holds only name/mana_cost/type_line/images — card-cache version bump required).

  Repro: cast the front face of Emeria's Call (Sorcery), tap it → your pool gains W even though a sorcery produces nothing. The inverse also misfires for DFCs whose *front* is the producer (tapping the transformed side still banks mana).

  **Plan:** thread the showing face into the credit decision — `onTap` in `GameTable.tsx` resolves `faceDef(get(card.cardId), card.showBack)` and `tapForMana` gates on that face's mana data, reusing the oracle-text parser from #<A#> (Scryfall has no per-face `produced_mana`). Extend `CardBack` with what the parse needs and bump the card-cache version.

  **Acceptance:** tapping an untransformed Emeria's Call banks nothing; transformed to Emeria, Shattered Skyclave, tapping banks W; a front-face producer banks only while the front is showing; `SET_TAPPED` itself is unchanged (credit is client-side bookkeeping). Shares its parser with #<A#>.

  *Follow-up to #21 (Mana Pool) and #22 (Transform cards).*

## Execution steps
1. Write each title + body to temp files (`Write` tool; per the skill's untrusted-text rule — no shell interpolation), filling `<A#>` in C's body with A's real number after creation.
2. Create in order A → B → C with `GH_PROMPT_DISABLED=1 gh issue create --repo PolarDyth/mtg --title "$title" --body-file <file> --label "<comma-separated labels>"`, then delete the temp files.
3. Report the three issue URLs.
4. Update memory (`mythic-table-playtest-roadmap.md` / `mythic-table-github-tracking.md`) with the new issue numbers — 3 late round-4 items, mana-counter follow-ups to #21/#22.