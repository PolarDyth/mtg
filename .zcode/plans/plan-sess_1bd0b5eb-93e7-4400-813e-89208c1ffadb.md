File the 10 round-4 playtest items as GitHub issues in PolarDyth/mtg, following round-3 conventions: body format `**Player report:** "<verbatim>" / current-state analysis with file:line refs / **Acceptance:**`, labels from the existing taxonomy, plus a new `playtest-r4` source label.

## Prep
1. `gh label list` to confirm `bug` exists (defaults confirmed present via `enhancement`).
2. Create `playtest-r4` label (color `BFDADC`, description "Round-4 playtest feedback") — mirrors `playtest-r3`.

## Issues (created via GitHub MCP `create_issue`, labels comma-listed)

**1. "Draggable card preview panel"** — `enhancement, ux, frontend, size-M, P3, playtest-r4`
Report: "be able to change place to preview cards". Position is hard-coded `fixed bottom-[160px] left-[100px]` (`GameTable.tsx:356-362`); only width is adjustable (`mtg:preview-width` + ctrl/⌘+scroll). Make the zoom preview draggable; persist position in `settings.ts`, clamped to viewport. **Accept:** drag anywhere, survives reload, doesn't swallow card pointer events.

**2. "Support partner commanders in the lobby"** — `enhancement, frontend, server, protocol, size-M, P2, playtest-r4`
Report: "partner commanders aren't able to be made in lobby". `SET_COMMANDER` is single-card and overwrites the zone (`deck.ts:98-101`); picking the 2nd partner silently discards the 1st; `Lobby.tsx:52,61,126` reads `commandCards[0]`; the decklist parser (`decklist.ts`) has no Commander section so exported partner lists bury both in the 99. Extend action to a pair (command zone array already unbounded), render pairs in lobby, parse `Commander:` headers as candidates. **Accept:** two partners sit in the command zone for all players, neither in library; re-pick replaces one; partner export loads both.

**3. "Show elapsed time for the current turn"** — `enhancement, frontend, server, protocol, size-S, P2, playtest-r4`
Report: "how long a turn has elapsed". PhaseBar already ticks a game clock from `startedAt` (`PhaseBar.tsx:61-67`); no per-turn stamp exists. Add `turnStartedAt` via `ctx.now()` at START_GAME/NEXT_TURN (`game.ts:48,114`), expose in `GameView`, render in PhaseBar. **Accept:** resets each NEXT_TURN, identical on all clients (server timestamp), deterministic tests.

**4. "Count one full round as one turn"** — `enhancement, server, protocol, size-S, P2, playtest-r4`
Report: "make it so one full round counts as a turn not each pass". `turnNumber += 1` per pass (`game.ts:114`) — 4P shows "Turn 9" in round 3. **User-locked decision: count rounds** — increment once per full cycle through all players. **Accept:** N players × N consecutive NEXT_TURNs advance the displayed turn by exactly 1, all clients agree, per-player turn chat lines unchanged.

**5. "Step back a turn (undo a turn pass)"** — `enhancement, server, protocol, frontend, size-S, P3, playtest-r4`
Report: "ability to go back a turn". Nothing exists — turn order only advances (`game.ts:102-123`). **User-locked decision: bookkeeping-only** — new action (e.g. `UNDO_TURN`) moves active player to the previous seat and steps the counter back; zones/untaps/draws NOT rewound (players adjust manually — no-enforcement philosophy); chat line announcing the takeback. **Accept:** accidental double-pass recoverable; all clients agree.

**6. "Tokens dissolve when moved off the battlefield"** — `enhancement, server, size-S, P2, playtest-r4`
Report: "putting a token anywhere outside the battlefield should make it dissolve". `moveCard` (`zones.ts:44-91`) treats tokens like cards — bounced/milled tokens persist with their ¶ annotation. Token-ness = `TOKEN_MARKER` annotation (`cards.ts:188`). In the move/discard/mill paths (`zones.ts:152-222`), remove the instance instead when a token's destination ≠ battlefield, with a chat line. **Accept:** token → hand/GY/library/exile vanishes for everyone with one chat line; real cards and battlefield moves unaffected.

**7. "Newest attachment should stack behind, not on top"** — `bug, frontend, server, size-S, P2, playtest-r4`
Report: "when you stack attach cards the latest card goes ontop where it should go behind". Attachment paint order = battlefield entry order (`PlayerBand.tsx:92-100` groups by array order; `CardSprite.tsx:140-147` cascade, all z-index 1 → DOM order decides); `attachCard` never reorders (`cards.ts:136-159`), so the latest *entering* card paints on top regardless of attach recency. Make attach recency drive stack order (reorder on ATTACH_CARD or track order) so the newest tucks in nearest the host. **Accept:** attach A then B → A keeps the outer slot, B behind, on every client.

**8. "Hotkey: +1/+1 counter on the hovered creature"** — `enhancement, frontend, size-S, P3, playtest-r4`
Report: "add hotkey to add +1/+1 to creatures". `Alt+P` buffs *all* creatures (`keybinds.ts:56`, `useGameActions.ts:29-43`); single-creature counters only via the Counters popover. Add hovered-card binds (pick a free combo pair, e.g. `Alt+=`/`Alt+−`) per the keybind recipe (KeybindId + DEFAULT_KEYBINDS + KEYBIND_LABELS + SHORTCUT_GROUPS + slice + coverage round-trip). Cross-ref #37. **Accept:** hover + bind increments the counter on all clients; cheat sheet + coverage test updated.

**9. "Hand 'Select' button floats above modals and popovers"** — `bug, ux, frontend, size-S, P2, playtest-r4`
Report: "select button is always visible even if something is over it". HandFan's Select/Done toggle is `z-[70]` (`HandFan.tsx:44-53`), hint z-70, selected cards z-60 — above every modal backdrop (z-40) and popover (z-50); no ancestor stacking context and `globals.css` defines no z scale. Drop hand chrome below the modal layer (≤ z-30). **Accept:** with hand-select active, any modal (pile viewer, token dialog, maximize overlay) fully covers the button/hint/selected cards.

**10. "Multi-select battlefield cards with bulk actions"** — `enhancement, frontend, size-L, P2, playtest-r4`
Report: "be able to select multiple cards on the battlefield and do actions with it". Selection exists only for the hand (`useHandSelection` + SelectionBar) and locally in PileModal; battlefield pointer-down (`GameTable.tsx:187-193`) has no selection branch. Add marquee/rubber-band select (and/or ctrl-click) for own permanents; reuse SelectionBar with battlefield bulk actions (tap/untap all, +1/+1 each, move to GY/exile/hand); per-card sends loop like hand selection. **Accept:** box-select highlights multiple permanents, one toolbar action applies to all, Esc clears, normal drag unaffected.

## Post-filing
- Report the 10 issue URLs back.
- Update the playtest-roadmap memory file with round 4 (10 items, issue numbers, the three user-locked decisions: round counting, bookkeeping-only rewind, draggable preview).