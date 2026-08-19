"use client";

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { CardView } from "@mythic/shared";
import type { CardDef } from "@/lib/scryfall";
import CardSprite from "./CardSprite";

/**
 * Your hand: overlapping strip along the bottom. Hover raises and enlarges
 * a card; dragging left-press pulls it out to the table.
 */
export default function HandFan({
  cards,
  getDef,
  onCardPointerDown,
  onCardContextMenu,
  onCardHover,
  draggedUid,
}: {
  cards: CardView[];
  getDef: (id: string | null) => CardDef | null;
  onCardPointerDown: (card: CardView, event: ReactPointerEvent) => void;
  onCardContextMenu: (card: CardView, event: ReactMouseEvent) => void;
  onCardHover: (def: CardDef | null) => void;
  draggedUid: string | null;
}) {
  const width = 110;
  const overlap = Math.min(52, Math.max(20, (800 - width) / Math.max(1, cards.length - 1)));

  return (
    <div
      data-drop="hand"
      className="relative flex h-[150px] shrink-0 items-end justify-center rounded-lg border border-zinc-800 bg-zinc-950/60"
    >
      {cards.map((card, i) => (
        <CardSprite
          key={card.uid}
          card={card}
          def={getDef(card.cardId)}
          width={width}
          dragging={draggedUid === card.uid}
          onCardPointerDown={onCardPointerDown}
          onCardContextMenu={onCardContextMenu}
          onCardHover={onCardHover}
          className="transition-transform duration-150 hover:z-50 hover:-translate-y-6 hover:scale-110"
          style={{
            position: "relative",
            left: 0,
            top: 0,
            marginLeft: i === 0 ? 0 : -width + overlap,
            zIndex: i,
          }}
        />
      ))}
      {cards.length === 0 && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-zinc-600">
          your hand is empty
        </span>
      )}
    </div>
  );
}
