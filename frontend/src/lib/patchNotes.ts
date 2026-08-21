export interface PatchNoteItem {
  /** Short bold lead, e.g. "Counters, overhauled". */
  title: string;
  /** Optional player-friendly follow-up sentence. */
  detail?: string;
}

export interface PatchNoteRelease {
  /** Stable React key + test anchor, e.g. "round-2-fixes". */
  id: string;
  /** Display label, e.g. "Round 2 — first fixes". */
  label: string;
  /** ISO date the release shipped. */
  date: string;
  items: PatchNoteItem[];
}

/**
 * Completed playtest-roadmap changes shown on the home page — newest release
 * first, and only items that actually shipped (the roadmap docs stay the
 * source of truth for what is still open). Append a release here when a
 * roadmap round ships.
 */
export const PATCH_NOTES: PatchNoteRelease[] = [
  {
    id: "round-3-mana-transform-search",
    label: "Round 3 — mana, transform, search",
    date: "2026-08-21",
    items: [
      {
        title: "Mana pool",
        detail:
          "Every player's header shows a W/U/B/R/G/C mana bar everyone can see. Tap a land, mana dork, or mana rock and its colors bank automatically — click your pips to add, right-click to spend, ✕ or Alt+C to clear.",
      },
      {
        title: "Transform double-faced cards",
        detail:
          "Right-click a transforming card or MDFC on the battlefield and pick \"Transform to…\", or hover it and press Alt+B — the whole table sees the other face, with counters and attachments kept.",
      },
      {
        title: "Search cards by their rules text",
        detail:
          "The pile viewer's filter now matches names, types, and rules text — type \"flying\" in your library to find every flier.",
      },
    ],
  },
  {
    id: "round-2-shortcut-polish",
    label: "Round 2 — shortcut polish",
    date: "2026-08-21",
    items: [
      {
        title: "Shortcuts work while reading the cheat sheet",
        detail:
          "Pressing a game shortcut with the ? cheat sheet open used to be silently ignored — it now closes the sheet and runs the shortcut, so trying combos straight off the sheet just works.",
      },
      {
        title: "The lobby says who can start",
        detail:
          "The waiting room now reads \"N/M decks loaded · anyone can start\" — no more waiting on a host that doesn't need to press the button.",
      },
    ],
  },
  {
    id: "round-2-convenience",
    label: "Round 2 — conveniences",
    date: "2026-08-21",
    items: [
      {
        title: "Buff your whole team at once",
        detail:
          "The Actions menu has a new Battlefield section: one click puts a +1/+1 counter on every creature you control — click again for another. Alt+P does it straight from the keyboard.",
      },
      {
        title: "Grid snapping",
        detail:
          "The header's display panel (zoom icon) has a new switch: turn it on and dropped cards land on a tidy grid instead of free-form. Ctrl+Alt+G toggles it while you lay out your board.",
      },
      {
        title: "More keyboard shortcuts",
        detail:
          "Hover a card and tap Alt+T to tap/untap it or Alt+H to start attaching it — plus Ctrl+Alt+S scry, Ctrl+Alt+V surveil, and Ctrl+Alt+M mulligan open their pickers straight from the keyboard. The ? cheat sheet lists everything.",
      },
    ],
  },
  {
    id: "round-2-small-features",
    label: "Round 2 — small features",
    date: "2026-08-21",
    items: [
      {
        title: "Leave button",
        detail:
          "\"Leave table\" in the waiting room and \"Leave\" in the game header give you a clean way out — your seat and cards go with you and the host role transfers.",
      },
      {
        title: "Turn counter & game clock",
        detail:
          "The phase bar now shows the turn number and how long the game has been running, so \"how long have we been at this?\" has an answer.",
      },
      {
        title: "Discard at random",
        detail:
          "Right-click a hand card or open the Actions menu to discard 1–30 cards from your hand at random — the server rolls the pick, so the whole table can trust it. Ctrl+Shift+D discards one instantly.",
      },
      {
        title: "Counter badges repositioned",
        detail:
          "+1/+1 and −1/−1 counters sit at the bottom-right of a card where they're easy to scan across a board; other counters stay top-left.",
      },
    ],
  },
  {
    id: "round-2-fixes",
    label: "Round 2 — first fixes",
    date: "2026-08-21",
    items: [
      {
        title: "Look at top N shows just the top N",
        detail:
          "Works like scry now — selecting, moving, and revealing only touch those N cards, the header says how many you are looking at, and closing the view won't shuffle your library.",
      },
      {
        title: "Card previews in the scry view",
        detail:
          "Hovering a card in the scry panel now shows the full-size preview beside it.",
      },
      {
        title: "Chat autoscroll fixed",
        detail:
          "The chat keeps sticking to the bottom even in long games with many messages. Scroll up to read and a pill appears to jump back down to the newest messages.",
      },
    ],
  },
  {
    id: "round-1",
    label: "Playtest round 1",
    date: "2026-08-21",
    items: [
      {
        title: "Opponents' hand sizes visible",
        detail:
          "Every player's header shows a card-count chip, and the chat roster shows each player's hand size.",
      },
      {
        title: "Deck loader understands theme card names",
        detail:
          "Paste a deck with story names like \"The Dead Marshes\" and it resolves to the real card (Urborg, Tomb of Yawgmoth). Near-misses fuzzy-match and are flagged so you can double-check them.",
      },
      {
        title: "Token & emblem search fixed",
        detail: "Searching for tokens now finds emblems too.",
      },
      {
        title: "Right-click a card to create its tokens",
        detail:
          "Cards that make tokens offer a count picker (for X amounts, Ctrl+G repeats the last count).",
      },
      {
        title: "Clone cards",
        detail:
          "Any face-up card on the battlefield — including an opponent's — can be cloned from its right-click menu.",
      },
      {
        title: "Cards no longer stick together when dragged",
        detail:
          "Dragging never auto-attaches. To attach, use the explicit \"Attach to…\" mode; press Esc to cancel.",
      },
      {
        title: "Counters, overhauled",
        detail:
          "Click a card's counter badge for the new editor: presets like +1/+1, hold-to-repeat buttons, direct value entry, and per-kind chips shown on the card.",
      },
      {
        title: "Easy game start",
        detail:
          "Starting a game automatically draws opening hands, the lobby shows how many decks are loaded, and the Actions menu has a mulligan picker.",
      },
      {
        title: "Turn phases",
        detail:
          "A phase bar sits above your hand — click a phase to jump there, or advance with Next. Ctrl+Enter moves to the next phase or turn; Ctrl+Shift+Enter passes the turn outright.",
      },
    ],
  },
];
