"use client";

import type { ComponentType } from "react";
import {
  ArrowDownToLine,
  ArrowDownUp,
  BookOpen,
  Dices,
  Eye,
  Hand,
  ListChecks,
  PlusCircle,
  RotateCcw,
  Search,
  Shuffle,
  Skull,
} from "lucide-react";
import type { PickerMode } from "./CountPickerModal";

type Tile = {
  name: string;
  desc: string;
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick: () => void;
};

/**
 * The actions dock: every game action you can take, each with a one-line
 * description of what it does. Opened from the header "Actions" button.
 */
export default function ActionsModal({
  libraryCount,
  creatureCount,
  onPicker,
  onShuffle,
  onSearchLibrary,
  onSelectCards,
  onBulkCounters,
  onClose,
}: {
  libraryCount: number;
  /** creatures you control right now (drives the bulk-counter tile) */
  creatureCount: number;
  onPicker: (mode: PickerMode) => void;
  onShuffle: () => void;
  onSearchLibrary: () => void;
  onSelectCards: () => void;
  /** +1/+1 on every creature you control (client-side loop of SET_COUNTERS) */
  onBulkCounters: () => void;
  onClose: () => void;
}) {
  const library: Tile[] = [
    { name: "Draw…", desc: "draw N cards from the top into your hand", Icon: Hand, onClick: () => onPicker("draw") },
    { name: "Mill…", desc: "put the top N cards into your graveyard", Icon: Skull, onClick: () => onPicker("mill") },
    { name: "Scry…", desc: "look at the top N, then sort them top / bottom", Icon: ArrowDownUp, onClick: () => onPicker("scry") },
    { name: "Surveil…", desc: "look at the top N, then sort them top / graveyard", Icon: ArrowDownToLine, onClick: () => onPicker("surveil") },
    { name: "Look at top N…", desc: "peek at the top of your library (just you)", Icon: BookOpen, onClick: () => onPicker("lookTop") },
    { name: "Reveal top N…", desc: "show the top N cards to the whole table", Icon: Eye, onClick: () => onPicker("revealTop") },
    { name: "Shuffle", desc: "shuffle your library", Icon: Shuffle, onClick: onShuffle },
    { name: "Search library…", desc: "view and filter your whole library", Icon: Search, onClick: onSearchLibrary },
  ];
  const hand: Tile[] = [
    {
      name: "Mulligan…",
      desc: "shuffle your hand into your library, then draw a fresh hand of N",
      Icon: RotateCcw,
      onClick: () => onPicker("mulligan"),
    },
    {
      name: "Select cards…",
      desc: "mark cards, then discard / exile / reveal / bottom them together",
      Icon: ListChecks,
      onClick: onSelectCards,
    },
    {
      name: "Discard at random…",
      desc: "the server picks N cards from your hand at random",
      Icon: Dices,
      onClick: () => onPicker("discardRandom"),
    },
  ];
  const battlefield: Tile[] = [
    {
      name: "Add +1/+1 to all creatures…",
      desc: `one +1/+1 counter on each creature you control (${creatureCount})`,
      Icon: PlusCircle,
      onClick: onBulkCounters,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="overlay-in flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-zinc-800 px-5 py-3">
          <h2 className="font-semibold text-zinc-100">Game actions</h2>
          <span className="text-xs text-zinc-500">
            {libraryCount} in your library · {creatureCount} creature
            {creatureCount === 1 ? "" : "s"}
          </span>
          <button
            onClick={onClose}
            className="ml-auto rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close actions"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
            Library
          </p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2">
            {library.map((tile) => (
              <ActionTile key={tile.name} tile={tile} disabled={libraryCount === 0} />
            ))}
          </div>

          <p className="mb-2 mt-5 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
            Hand
          </p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2">
            {hand.map((tile) => (
              <ActionTile key={tile.name} tile={tile} />
            ))}
          </div>

          <p className="mb-2 mt-5 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
            Battlefield
          </p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2">
            {battlefield.map((tile) => (
              <ActionTile key={tile.name} tile={tile} disabled={creatureCount === 0} />
            ))}
          </div>
        </div>

        <footer className="border-t border-zinc-800 px-5 py-2.5 text-xs text-zinc-600">
          right-click any card for that card&apos;s actions · dragging cards between zones works
          too
        </footer>
      </div>
    </div>
  );
}

function ActionTile({ tile, disabled }: { tile: Tile; disabled?: boolean }) {
  return (
    <button
      onClick={tile.onClick}
      disabled={disabled}
      className="flex items-start gap-2.5 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-left transition-colors hover:border-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-800"
    >
      <tile.Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500/80" strokeWidth={1.75} />
      <span>
        <span className="block text-sm font-medium text-zinc-100">{tile.name}</span>
        <span className="block text-xs leading-snug text-zinc-500">{tile.desc}</span>
      </span>
    </button>
  );
}
