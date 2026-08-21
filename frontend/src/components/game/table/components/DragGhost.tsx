"use client";

/**
 * The card image that follows the cursor during a drag — or a labeled
 * placeholder when the def isn't loaded. Sized to the card width of the
 * surface being dragged over (table / focus board / duel / maximized).
 */

import type { GameView, PlayerId } from "@mythic/shared";
import type { CardDef } from "@/lib/scryfall";
import { CARD_RATIO } from "../../CardSprite";
import { cardWidthFor, imageFor, type FocusMode } from "../../tableLayout";
import { findOwnCard } from "../foundation";
import type { DragState } from "../hooks/useCardDrag";

export function DragGhost({
  drag,
  get,
  view,
  you,
  focus,
  maximized,
}: {
  drag: DragState;
  get: (id: string | null) => CardDef | null;
  view: GameView;
  you: PlayerId | null;
  focus: FocusMode | null;
  maximized: boolean;
}) {
  const draggedDef = get(findOwnCard(view, you, drag.uid)?.card.cardId ?? null);
  const ghostWidth = cardWidthFor(focus, maximized);
  const ghostHeight = Math.round(ghostWidth * CARD_RATIO);

  if (draggedDef) {
    return (
      <div
        className="pointer-events-none fixed z-50"
        style={{ left: drag.x - ghostWidth / 2, top: drag.y - ghostHeight / 2 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageFor(ghostWidth) === "normal" ? draggedDef.normal : draggedDef.small}
          alt=""
          draggable={false}
          style={{ width: ghostWidth }}
          className="rounded-md opacity-90 shadow-2xl"
        />
      </div>
    );
  }
  return (
    <div
      className="pointer-events-none fixed z-50 flex items-center justify-center rounded-md border border-amber-700 bg-amber-950/80 text-xs text-amber-200"
      style={{
        left: drag.x - ghostWidth / 2,
        top: drag.y - ghostHeight / 2,
        width: ghostWidth,
        height: ghostHeight,
      }}
    >
      card
    </div>
  );
}
