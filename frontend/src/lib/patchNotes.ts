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
