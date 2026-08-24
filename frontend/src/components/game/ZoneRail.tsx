"use client";

import type { ComponentType } from "react";
import type { Zone, ZoneView } from "@cardessa/shared";
import { Backpack, Ban, Crown, LibraryBig, Skull } from "lucide-react";

type PileSpec = {
  zone: Zone;
  label: string;
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  hint: string;
};

const PILES: PileSpec[] = [
  { zone: "library", label: "Library", Icon: LibraryBig, hint: "click: draw 1 · right-click: menu" },
  { zone: "graveyard", label: "Graveyard", Icon: Skull, hint: "click: view pile" },
  { zone: "exile", label: "Exile", Icon: Ban, hint: "click: view pile" },
  { zone: "command", label: "Command", Icon: Crown, hint: "click: view pile" },
  { zone: "sideboard", label: "Sideboard", Icon: Backpack, hint: "click: view pile" },
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
      {PILES.map(({ zone, label, Icon, hint }) => {
        const view = zones[zone];
        const count = view.kind === "cards" ? view.cards.length : view.count;
        return (
          <button
            key={zone}
            data-drop={`zone:${zone}`}
            onClick={() => onPileClick(zone)}
            onContextMenu={(e) => {
              e.preventDefault();
              onPileContextMenu(zone, e.clientX, e.clientY);
            }}
            title={`${label} (${count}) — ${hint}`}
            className="group relative flex h-[86px] flex-col items-center justify-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/70 text-zinc-400 transition-colors hover:border-emerald-700 hover:text-zinc-200"
          >
            <Icon className="h-7 w-7" strokeWidth={1.5} />
            <span className="absolute right-1.5 top-1 font-mono text-[11px] font-semibold text-zinc-500 group-hover:text-zinc-300">
              {count}
            </span>
            <span className="absolute bottom-1 text-[9px] uppercase tracking-wide text-zinc-700 group-hover:text-zinc-500">
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
