import type { PlayerId, PlayerView } from "@mythic/shared";

/** Which board(s) fill the battlefield area instead of the full table. */
export type FocusMode =
  | { kind: "board"; playerId: PlayerId }
  | { kind: "duel"; opponentId: PlayerId };

/** The player a focus mode is about, regardless of variant. */
export function focusPlayerId(focus: FocusMode): PlayerId {
  return focus.kind === "board" ? focus.playerId : focus.opponentId;
}

/** One player's cell in the table grid. */
export type Seat = {
  player: PlayerView;
  row: 0 | 1;
  /** 0-based column; spans fill leftover columns in the bottom row. */
  col: number;
  colSpan: number;
};

export type SeatGrid = {
  cols: number;
  rows: 1 | 2;
  seats: Seat[];
};

/**
 * Seat the table as seen from YOUR chair: your board anchors the bottom row
 * — flush LEFT whenever opponents share it (next to your zone rail), or
 * spanning the full row when you're alone in it. Opponents fill the top row
 * first, then the rest of your row, in join order. 2 players = two
 * full-width rows (the classic face-off), 4 = corner quadrants (you
 * bottom-left), 6 = a 3×2 table.
 */
export function seatGrid(players: PlayerView[], you: PlayerId | null): SeatGrid {
  if (players.length === 0) return { cols: 1, rows: 1, seats: [] };

  const opponents = players.filter((p) => p.id !== you);
  const self = players.find((p) => p.id === you) ?? null;
  const seated = self ? [...opponents, self] : opponents;

  if (seated.length === 1) {
    return { cols: 1, rows: 1, seats: [{ player: seated[0], row: 0, col: 0, colSpan: 1 }] };
  }

  const cols = Math.max(1, Math.ceil(seated.length / 2));
  const top = opponents.slice(0, cols);
  const rest = opponents.slice(cols); // opponents sharing your row

  const seats: Seat[] = top.map((player, col) => ({
    player,
    row: 0,
    col,
    colSpan: 1,
  }));
  if (self) {
    // you take the bottom-left cell(s); any leftover column widens your board
    const youSpan = Math.max(1, cols - rest.length);
    seats.push({ player: self, row: 1, col: 0, colSpan: youSpan });
    rest.forEach((player, i) =>
      seats.push({ player, row: 1, col: youSpan + i, colSpan: 1 })
    );
  } else {
    // no seated viewer (defensive): fill the bottom row, last seat spans leftovers
    rest.forEach((player, col) => {
      const isLast = col === rest.length - 1;
      seats.push({ player, row: 1, col, colSpan: isLast ? cols - col : 1 });
    });
  }
  return { cols, rows: 2, seats };
}

/** Card widths (px) per view mode — table stays at Scryfall `small` size. */
export const CARD_W = { table: 90, duel: 130, duelMax: 170, board: 190, boardMax: 260 } as const;

/** Card width for YOUR board (and the drag ghost) in the current view mode. */
export function cardWidthFor(focus: FocusMode | null, maximized: boolean): number {
  if (!focus) return CARD_W.table;
  if (focus.kind === "board") return maximized ? CARD_W.boardMax : CARD_W.board;
  return maximized ? CARD_W.duelMax : CARD_W.duel;
}

/** Which Scryfall image size renders sharply at a given width. */
export function imageFor(width: number): "small" | "normal" {
  return width >= 150 ? "normal" : "small";
}
