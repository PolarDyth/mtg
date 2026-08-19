"use client";

import type { Zone, ZoneView } from "@mythic/shared";

type PileSpec = {
  zone: Zone;
  label: string;
  icon: string;
  hint: string;
};

const PILES: PileSpec[] = [
  { zone: "library", label: "Library", icon: "📚", hint: "click: draw 1 · right-click: menu" },
  { zone: "graveyard", label: "Graveyard", icon: "🪦", hint: "click: view pile" },
  { zone: "exile", label: "Exile", icon: "✨", hint: "click: view pile" },
  { zone: "command", label: "Command", icon: "👑", hint: "click: view pile" },
  { zone: "sideboard", label: "Sideboard", icon: "🎒", hint: "click: view pile" },
];

/** Vertical strip of your zone piles, left of your battlefield band. */
export default function ZoneRail({
  zones,
  onPileClick,
  onPileContextMenu,
}: {
  zones: Record<Zone, ZoneView>;
  onPileClick: (zone: Zone) => void;
  onPileContextMenu: (zone: Zone, x: number, y: number) => void;
}) {
  return (
    <div className="flex w-[76px] shrink-0 flex-col gap-2">
      {PILES.map((pile) => {
        const view = zones[pile.zone];
        const count = view.kind === "cards" ? view.cards.length : view.count;
        return (
          <button
            key={pile.zone}
            data-drop={`zone:${pile.zone}`}
            onClick={() => onPileClick(pile.zone)}
            onContextMenu={(e) => {
              e.preventDefault();
              onPileContextMenu(pile.zone, e.clientX, e.clientY);
            }}
            title={`${pile.label} — ${pile.hint}`}
            className="group relative flex h-[86px] flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950/70 transition-colors hover:border-emerald-700"
          >
            <span className="text-2xl opacity-80 group-hover:opacity-100">{pile.icon}</span>
            <span className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">
              {count}
            </span>
            <span className="absolute bottom-1 text-[9px] text-zinc-700 group-hover:text-zinc-500">
              {pile.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
