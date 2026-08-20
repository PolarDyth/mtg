"use client";

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { CardView, PlayerId, PlayerView } from "@mythic/shared";
import type { CardDef } from "@/lib/scryfall";
import CardSprite from "./CardSprite";

/**
 * The battlefield: one horizontal band per player in a FIXED seat order that
 * is identical for every viewer — the room creator sits at the bottom, later
 * players stack above. A card's (x%, y%) are percentages of its owner's band
 * (card center), so a card occupies the same spot on everyone's screen.
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
  // Seat 0 (creator) renders last = bottom band, identical on every screen.
  const ordered = [...players].reverse();
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
            <span className="pointer-events-none absolute left-2 top-1 text-[10px] uppercase tracking-wider text-zinc-600">
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
                    dragging={draggedUid === card.uid}
                    onCardPointerDown={onCardPointerDown}
                    onCardContextMenu={onCardContextMenu}
                    onCardHover={onCardHover}
                    style={{ left: `${card.x}%`, top: `${card.y}%` }}
                  />
                  {stack.map((follower, i) => (
                    <CardSprite
                      key={follower.uid}
                      card={follower}
                      def={getDef(follower.cardId)}
                      width={90}
                      centered
                      dragging={draggedUid === follower.uid}
                      attachedStackIndex={i + 1}
                      onCardPointerDown={onCardPointerDown}
                      onCardContextMenu={onCardContextMenu}
                      onCardHover={onCardHover}
                      style={{
                        left: `${card.x}%`,
                        top: `${card.y}%`,
                      }}
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