"use client";

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { CardView, PlayerId, PlayerView } from "@mythic/shared";
import type { CardDef } from "@/lib/scryfall";
import CardSprite from "./CardSprite";

/**
 * The battlefield, laid out like a real table: YOUR band is always at the
 * bottom of your own screen, opponents stack above in seat order. A card's
 * (x%, y%) are percentages of its OWNER's band (card center) in the owner's
 * frame; every opponent band renders point-mirrored — position (100−x, 100−y)
 * with the card rotated 180° — so a card near the owner's edge appears near
 * the top of that band on your screen, exactly like sitting across the table.
 */
export default function Battlefield({
  players,
  you,
  getDef,
  onCardPointerDown,
  onCardContextMenu,
  onCardHover,
  draggedUid,
  battlefieldRef,
}: {
  players: PlayerView[];
  you: PlayerId | null;
  getDef: (id: string | null) => CardDef | null;
  onCardPointerDown: (card: CardView, event: ReactPointerEvent) => void;
  onCardContextMenu: (card: CardView, event: ReactMouseEvent) => void;
  onCardHover: (def: CardDef | null) => void;
  draggedUid: string | null;
  battlefieldRef: React.RefObject<HTMLDivElement | null>;
}) {
  // Viewer-centric: opponents above in seat order, you last = bottom band.
  const ordered = [
    ...players.filter((p) => p.id !== you),
    ...players.filter((p) => p.id === you),
  ];
  const bandHeight = 100 / Math.max(1, ordered.length);

  return (
    <div
      ref={battlefieldRef}
      data-drop="battlefield"
      className="relative flex-1 overflow-hidden rounded-lg border border-zinc-800 bg-[radial-gradient(ellipse_at_center,#131a15_0%,#0b0f0c_80%)]"
    >
      {ordered.map((player, index) => {
        const cards =
          player.zones.battlefield.kind === "cards" ? player.zones.battlefield.cards : [];
        // across the table from you: point-mirrored position + rotated cards
        const mirrored = you !== null && player.id !== you;
        const pos = (x: number, y: number): React.CSSProperties =>
          mirrored
            ? { left: `${100 - x}%`, top: `${100 - y}%` }
            : { left: `${x}%`, top: `${y}%` };
        // attachments grouped per host uid; attached cards follow the host
        const byUid = new Map(cards.map((c) => [c.uid, c]));
        const attached = new Map<string, CardView[]>();
        for (const card of cards) {
          if (card.attachedTo && byUid.has(card.attachedTo)) {
            const list = attached.get(card.attachedTo) ?? [];
            list.push(card);
            attached.set(card.attachedTo, list);
          }
        }
        return (
          <div
            key={player.id}
            className="absolute inset-x-0 border-b border-dashed border-zinc-800/60"
            style={{ top: `${index * bandHeight}%`, height: `${bandHeight}%` }}
          >
            <span
              className={`pointer-events-none absolute text-[10px] uppercase tracking-wider text-zinc-600 ${
                mirrored ? "bottom-1 right-2 rotate-180" : "left-2 top-1"
              }`}
            >
              {player.name}
              {player.id === you ? " (you)" : ""}
            </span>
            {cards.map((card) => {
              if (card.attachedTo && byUid.has(card.attachedTo)) return null;
              const stack = attached.get(card.uid) ?? [];
              return (
                <div key={card.uid}>
                  <CardSprite
                    card={card}
                    def={getDef(card.cardId)}
                    width={90}
                    centered
                    mirrored={mirrored}
                    dragging={draggedUid === card.uid}
                    onCardPointerDown={onCardPointerDown}
                    onCardContextMenu={onCardContextMenu}
                    onCardHover={onCardHover}
                    style={pos(card.x, card.y)}
                  />
                  {stack.map((follower, i) => (
                    <CardSprite
                      key={follower.uid}
                      card={follower}
                      def={getDef(follower.cardId)}
                      width={90}
                      centered
                      mirrored={mirrored}
                      dragging={draggedUid === follower.uid}
                      attachedStackIndex={i + 1}
                      onCardPointerDown={onCardPointerDown}
                      onCardContextMenu={onCardContextMenu}
                      onCardHover={onCardHover}
                      style={pos(card.x, card.y)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}