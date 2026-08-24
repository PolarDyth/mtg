"use client";

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { CardView } from "@cardessa/shared";
import type { CardDef } from "@/lib/scryfall";
import CardSprite from "./CardSprite";

/**
 * Your hand: overlapping strip along the bottom. Hover raises and enlarges
 * a card; dragging left-press pulls it out to the table. Select mode turns
 * clicks into selection toggles for group actions (discard / exile / reveal).
 */
export default function HandFan({
  cards,
  getDef,
  onCardPointerDown,
  onCardContextMenu,
  onCardHover,
  draggedUid,
  selectMode,
  selected,
  onToggleSelectMode,
  onToggleSelect,
}: {
  cards: CardView[];
  getDef: (id: string | null) => CardDef | null;
  onCardPointerDown: (card: CardView, event: ReactPointerEvent) => void;
  onCardContextMenu: (card: CardView, event: ReactMouseEvent) => void;
  onCardHover: (def: CardDef | null, card: CardView | null) => void;
  draggedUid: string | null;
  selectMode: boolean;
  selected: ReadonlySet<string>;
  onToggleSelectMode: () => void;
  onToggleSelect: (card: CardView) => void;
}) {
  const width = 110;
  const overlap = Math.min(52, Math.max(20, (800 - width) / Math.max(1, cards.length - 1)));

  return (
    <div
      data-drop="hand"
      className="relative flex h-[150px] shrink-0 items-end justify-center rounded-lg border border-zinc-800 bg-zinc-950/60"
    >
      <button
        onClick={onToggleSelectMode}
        className={`absolute right-2 top-2 z-30 rounded-md border px-2.5 py-1 text-xs transition-colors ${
          selectMode
            ? "border-emerald-600 bg-emerald-800/60 text-emerald-200"
            : "border-zinc-700 bg-zinc-900/80 text-zinc-400 hover:border-emerald-700 hover:text-zinc-200"
        }`}
      >
        {selectMode ? "Done" : "Select"}
      </button>
      {selectMode && cards.length > 0 && (
        <span className="absolute left-2 top-3 z-30 text-xs text-zinc-600">
          click cards to mark them
        </span>
      )}

      {cards.map((card, i) => {
        const isSelected = selected.has(card.uid);
        return (
          <div
            key={card.uid}
            onClick={() => selectMode && onToggleSelect(card)}
            className={`relative transition-transform duration-150 ${
              selectMode ? "cursor-pointer" : "hover:z-30 hover:-translate-y-6 hover:scale-110"
            } ${isSelected ? "-translate-y-5" : ""}`}
            style={{ marginLeft: i === 0 ? 0 : -width + overlap, zIndex: isSelected ? 30 : i }}
          >
            <div className={`rounded-lg ${isSelected ? "ring-2 ring-emerald-500" : ""}`}>
              <CardSprite
                card={card}
                def={getDef(card.cardId)}
                width={width}
                dragging={draggedUid === card.uid}
                onCardPointerDown={onCardPointerDown}
                onCardContextMenu={onCardContextMenu}
                onCardHover={onCardHover}
                style={{ position: "relative", left: 0, top: 0 }}
              />
            </div>
          </div>
        );
      })}
      {cards.length === 0 && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-zinc-600">
          your hand is empty
        </span>
      )}
    </div>
  );
}
