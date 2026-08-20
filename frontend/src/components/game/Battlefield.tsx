"use client";

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import type { Arrow, CardView, PlayerId, PlayerView } from "@mythic/shared";
import type { CardDef } from "@/lib/scryfall";
import ArrowLayer from "./ArrowLayer";
import PlayerBand from "./PlayerBand";
import { cardWidthFor, focusPlayerId, imageFor, seatGrid, type FocusMode } from "./tableLayout";

/**
 * The battlefield, viewed from YOUR chair. Table mode seats everyone into a
 * corner grid — you always in the bottom row, spanning it when the count is
 * odd (2 players = two full-width rows, 4 = quadrants, 6 = 3×2). Focus modes
 * swap the grid for one board (any player) or a you-vs-one-opponent duel
 * stacked like a two-player table. Positions stay owner-relative
 * percentages in every mode; see PlayerBand for the mirroring contract.
 */
export default function Battlefield({
  players,
  you,
  activePlayerId,
  focus,
  maximized,
  arrows,
  arrowTargetedUid,
  arrowTargetedPlayerId,
  onRemoveArrow,
  onFocus,
  onDuel,
  onExitFocus,
  onToggleMaximize,
  onOpponentPile,
  getDef,
  onCardPointerDown,
  onCardContextMenu,
  onCardHover,
  draggedUid,
  battlefieldRef,
}: {
  players: PlayerView[];
  you: PlayerId | null;
  activePlayerId: PlayerId;
  focus: FocusMode | null;
  maximized: boolean;
  arrows: Arrow[];
  /** drawing UI: hovered arrow target (card / player head) */
  arrowTargetedUid: string | null;
  arrowTargetedPlayerId: PlayerId | null;
  onRemoveArrow: (id: string) => void;
  onFocus: (playerId: PlayerId) => void;
  onDuel: (playerId: PlayerId) => void;
  onExitFocus: () => void;
  onToggleMaximize: () => void;
  /** open an opponent's public pile (graveyard/exile/command) read-only */
  onOpponentPile: (playerId: PlayerId, zone: "graveyard" | "exile" | "command") => void;
  getDef: (id: string | null) => CardDef | null;
  onCardPointerDown: (card: CardView, event: ReactPointerEvent) => void;
  onCardContextMenu: (card: CardView, event: ReactMouseEvent) => void;
  onCardHover: (def: CardDef | null, card: CardView | null) => void;
  draggedUid: string | null;
  /** anchors to YOUR board's container in whatever mode is active */
  battlefieldRef: React.RefObject<HTMLDivElement | null>;
}) {
  // render-time guard: focusing a player who left falls back to the table
  const live =
    focus && players.some((p) => p.id === focusPlayerId(focus)) ? focus : null;
  const self = players.find((p) => p.id === you) ?? null;

  type Band = {
    player: PlayerView;
    isYou: boolean;
    mirrored: boolean;
    row: number;
    col: number;
    colSpan: number;
  };
  let cols = 1;
  let rows = "1fr";
  let bands: Band[] = [];
  let label = "";

  if (live?.kind === "board") {
    const player = players.find((p) => p.id === live.playerId)!;
    const isYou = player.id === you;
    cols = 1;
    rows = "1fr";
    bands = [{ player, isYou, mirrored: !isYou, row: 0, col: 0, colSpan: 1 }];
    label = isYou ? "Your board" : `${player.name}'s board`;
  } else if (live?.kind === "duel" && self) {
    const opponent = players.find((p) => p.id === live.opponentId)!;
    cols = 1;
    rows = "1fr 1fr";
    bands = [
      { player: opponent, isYou: false, mirrored: true, row: 0, col: 0, colSpan: 1 },
      { player: self, isYou: true, mirrored: false, row: 1, col: 0, colSpan: 1 },
    ];
    label = `You vs ${opponent.name}`;
  } else {
    const grid = seatGrid(players, you);
    cols = grid.cols;
    rows = grid.rows === 2 ? "1fr 1fr" : "1fr";
    bands = grid.seats.map((seat) => ({
      player: seat.player,
      isYou: seat.player.id === you,
      mirrored: you !== null && seat.player.id !== you,
      row: seat.row,
      col: seat.col,
      colSpan: seat.colSpan,
    }));
  }

  const width = cardWidthFor(live, maximized);
  const image = imageFor(width);
  // re-mount the grid per view mode so the entrance animation replays on
  // every table ↔ board/duel switch
  const modeKey = live ? `${live.kind}:${focusPlayerId(live)}` : "table";

  return (
    <div
      data-drop="battlefield"
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-[radial-gradient(ellipse_at_center,#131a15_0%,#0b0f0c_80%)]"
    >
      {live && (
        <div className="bar-in flex h-8 shrink-0 items-center gap-2 border-b border-zinc-800/70 px-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-300/80">
            {label}
          </span>
          <span className="ml-auto flex items-center gap-0.5">
            <button
              onClick={onToggleMaximize}
              title={maximized ? "Exit fullscreen" : "Fullscreen"}
              className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            >
              {maximized ? (
                <Minimize2 className="h-4 w-4" strokeWidth={1.75} />
              ) : (
                <Maximize2 className="h-4 w-4" strokeWidth={1.75} />
              )}
            </button>
            <button
              onClick={onExitFocus}
              title="Back to the table"
              className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </span>
        </div>
      )}
      <div
        key={modeKey}
        className="board-in grid min-h-0 flex-1 gap-1 p-1"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: rows,
        }}
      >
        {bands.map((band) => (
          <PlayerBand
            key={band.player.id}
            player={band.player}
            isYou={band.isYou}
            mirrored={band.mirrored}
            cardWidth={width}
            image={image}
            activeTurn={band.player.id === activePlayerId}
            row={band.row}
            col={band.col}
            colSpan={band.colSpan}
            getDef={getDef}
            onCardPointerDown={onCardPointerDown}
            onCardContextMenu={onCardContextMenu}
            onCardHover={onCardHover}
            draggedUid={draggedUid}
            arrowTargetedUid={arrowTargetedUid}
            headTargeted={arrowTargetedPlayerId === band.player.id}
            onFocus={() => onFocus(band.player.id)}
            onDuel={band.isYou ? undefined : () => onDuel(band.player.id)}
            onPile={
              band.isYou
                ? undefined
                : (zone) => onOpponentPile(band.player.id, zone)
            }
            boardRef={band.isYou ? battlefieldRef : undefined}
          />
        ))}
      </div>
      {/* arrows sit above every band so they can cross board borders */}
      <ArrowLayer arrows={arrows} players={players} onRemove={onRemoveArrow} />
    </div>
  );
}
