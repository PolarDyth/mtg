# Patch Notes panel on the home page

Add a **collapsible "Patch notes" panel** below the join card on `/`, showing **only completed roadmap items** (12 total), written in **player-friendly wording** (no component/file names). Collapsed by default with a teaser of the latest release.

## Content source (from the two roadmap docs)

Only shipped items, grouped newest-first:

**Round 2 — first fixes (2026-08-21, 3 items)** from `2026-08-21-playtest-feedback-roadmap.md` §6/§7/§10 (marked `done`):
1. **Look at top N shows just the top N** — works like scry now: selecting, moving, and revealing only touch those N cards; the header says "top N of M" and closing doesn't shuffle.
2. **Card previews in the scry view** — hovering a card in the scry panel shows the full-size preview beside it.
3. **Chat autoscroll fixed past the cap** — the log keeps sticking to the bottom even when old messages are trimmed; scroll up and a "↓ N new messages" pill jumps you back.

**Playtest round 1 (2026-08-21, 9 items)** — all of `2026-08-20-playtest-feedback-roadmap.md` §2–§10 (all `✅`):
1. **Opponents' hand sizes visible** — count chip on every player's header and a hand badge in the chat roster.
2. **Deck loader understands theme/flavor names** — e.g. "The Dead Marshes" resolves to Urborg, Tomb of Yawgmoth; near-misses fuzzy-match (flagged with a "search" tag).
3. **Token & emblem search fixed** — both token and emblem cards now show up.
4. **Right-click a card → Create token** — count picker for X, Ctrl+G repeats the last count.
5. **Clone** — any face-up battlefield card, including opponents', via a slim right-click menu.
6. **Cards no longer stick together when dragged** — auto-attach removed; explicit "Attach to…" targeting mode instead (Esc cancels).
7. **Counters overhauled** — popover editor with presets (+1/+1, Lore, Shield…), hold-to-repeat steppers, direct value entry, and per-kind chips on cards.
8. **Easy game start** — starting a game auto-draws opening hands (7 or fewer), the lobby shows "N/M decks loaded", and the Actions dock has a mulligan picker.
9. **Turn phases** — a phase bar above your hand; click to jump, "Next ▸" advances, Ctrl+Enter goes to the next phase/turn, Ctrl+Shift+Enter passes outright.

None of the 11 incomplete round-2 items (visible stack/casting, transform, give control, mana pool, random discard, turn counter, leave button, bulk +1/+1, grid snapping, counter badge placement) appear anywhere.

## Files

```
frontend/src/lib/patchNotes.ts        (new — data module, keybinds.ts convention)
frontend/src/lib/patchNotes.test.ts   (new — data sanity test)
frontend/src/components/PatchNotes.tsx(new — collapsible panel)
frontend/src/app/page.tsx             (edit — mount the panel)
```

### 1. `frontend/src/lib/patchNotes.ts`

```ts
export interface PatchNoteItem {
  title: string;   // short bold lead, e.g. "Counters, overhauled"
  detail?: string; // optional player-friendly follow-up sentence
}

export interface PatchNoteRelease {
  id: string;      // stable React key + test anchor, e.g. "round-2-fixes"
  label: string;   // "Round 2 — first fixes"
  date: string;    // "2026-08-21"
  items: PatchNoteItem[];
}

/** Newest release first. Append here when a roadmap round ships. */
export const PATCH_NOTES: PatchNoteRelease[] = [ /* the 2 releases above */ ];
```

Hand-maintained data (like `SHORTCUT_GROUPS` in `keybinds.ts`) — no markdown dependency, no build-time parsing of the roadmap docs.

### 2. `frontend/src/components/PatchNotes.tsx`

- `"use client"`; `const [open, setOpen] = useState(false)`.
- Collapsed: panel header is a full-width `<button>` — `ScrollText` lucide icon, "Patch notes" label, rotating `ChevronDown` (`rotate-180` when open, `aria-expanded`) — plus a muted teaser line: latest release label, item count, and date.
- Expanded: each release renders a label row (label + date, small emerald dot on the newest) followed by a `ul` of items: `title` in `text-zinc-200 font-medium`, `detail` in `text-zinc-400`.
- Styling matches the join card: `rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 mt-6 shadow-xl backdrop-blur`, zinc text scale, emerald accents only, lucide icons at `h-3.5/h-4 w-3.5/4 strokeWidth={1.75}` — no emojis.

### 3. `frontend/src/app/page.tsx`

Import `PatchNotes` and render `<PatchNotes />` between the join-card `div` (line 158) and the "Bring your own decklist." footer `<p>` — inside the existing `max-w-md` column.

### 4. `frontend/src/lib/patchNotes.test.ts`

Vitest sanity checks on `PATCH_NOTES`: at least one release; every release has a non-empty unique `id`/`label`/`date` and ≥1 item; every item has a non-empty `title`; dates are non-increasing (newest first). Colocated with the data like `keybinds` tests.

## Verification

- `npm test` (root — vitest picks up the new frontend test)
- `cd frontend && npx tsc --noEmit && npx eslint src`
- Manual on `npm run dev`: home page shows the collapsed panel by default below the join card; clicking expands it; 12 items across 2 releases; none of the incomplete round-2 features appear; layout/theme consistent.

## Acceptance criteria

- Home page has a patch-notes area below the join card, collapsed by default, teaser showing the latest release.
- Toggle works (chevron rotates, `aria-expanded` set); re-render keeps state.
- Exactly the 12 completed items in player-friendly wording; no dev jargon, no incomplete items.
- Tests, typecheck, and eslint all pass.

## Out of scope (deliberate)

- No game-page entry point (a header button could be added later).
- No auto-sync from the roadmap markdown — appending to `PATCH_NOTES` when a round ships is the update path.
- Round-2 §15 ("works today") is not a change, so it's excluded.