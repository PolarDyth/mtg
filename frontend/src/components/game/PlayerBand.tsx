"use client";

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { Ban, BookOpen, Crown, Hand, Maximize2, Skull, Swords } from "lucide-react";
import type { CardView, ManaColor, PlayerView } from "@cardessa/shared";
import type { CardDef } from "@/lib/scryfall";
import CardSprite from "./CardSprite";
import { ManaBar } from "./table/components/ManaBar";

/** Opponent piles you can peek at from their band header. */
const PILE_CHIPS: { zone: "graveyard" | "exile" | "command"; label: string; Icon: typeof Skull }[] = [
  { zone: "graveyard", label: "graveyard", Icon: Skull },
  { zone: "exile", label: "exile", Icon: Ban },
  { zone: "command", label: "command zone", Icon: Crown },
];

/** Opponent hidden zones shown as counts only — informational, not clickable. */
const COUNT_CHIPS: { zone: "hand" | "library"; label: string; Icon: typeof Hand }[] = [
  { zone: "hand", label: "hand", Icon: Hand },
  { zone: "library", label: "library", Icon: BookOpen },
];

/**
 * One player's board as a grid cell: a slim header (name, focus buttons)
 * above the card area. A card's (x%, y%) are percentages of its OWNER's
 * board (card center) in the owner's frame; opponents render point-mirrored
 * — position (100−x, 100−y) — so a card near the middle of the table stays
 * near the middle for every viewer. Card art itself stays upright.
 */
export default function PlayerBand({
  player,
  isYou,
  mirrored,
  cardWidth,
  image,
  activeTurn,
  row,
  col,
  colSpan,
  getDef,
  onCardPointerDown,
  onCardContextMenu,
  onCardHover,
  draggedUid,
  /** uid of the card currently hovered as an arrow target (drawing UI) */
  arrowTargetedUid,
  /** uids checked into the battlefield multi-selection */
  selectedUids,
  /** this band's header is hovered as an arrow target */
  headTargeted,
  onFocus,
  onDuel,
  onPile,
  onManaAdd,
  onManaSpend,
  onManaClear,
  onBoardPointerDown,
  boardRef,
}: {
  player: PlayerView;
  isYou: boolean;
  /** render point-mirrored positions (opponents across the table) */
  mirrored: boolean;
  cardWidth: number;
  image: "small" | "normal";
  activeTurn: boolean;
  row: number;
  col: number;
  colSpan: number;
  getDef: (id: string | null) => CardDef | null;
  onCardPointerDown: (card: CardView, event: ReactPointerEvent) => void;
  onCardContextMenu: (card: CardView, event: ReactMouseEvent) => void;
  onCardHover: (def: CardDef | null, card: CardView | null) => void;
  draggedUid: string | null;
  arrowTargetedUid: string | null;
  selectedUids: Set<string>;
  headTargeted: boolean;
  onFocus?: () => void;
  onDuel?: () => void;
  /** open one of this opponent's public piles (only set for opponents) */
  onPile?: (zone: "graveyard" | "exile" | "command") => void;
  /** mana-pip editing — your own band only */
  onManaAdd?: (color: ManaColor) => void;
  onManaSpend?: (color: ManaColor) => void;
  onManaClear?: () => void;
  /** marquee multi-select — your own band's board surface only */
  onBoardPointerDown?: (event: ReactPointerEvent) => void;
  /** drop-math anchor — attached only to your own board */
  boardRef?: React.Ref<HTMLDivElement>;
}) {
  const cards =
    player.zones.battlefield.kind === "cards" ? player.zones.battlefield.cards : [];
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
      className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-zinc-950/30 ${
        activeTurn
          ? "border-emerald-600/70 shadow-[0_0_12px_rgba(16,185,129,0.18)]"
          : "border-zinc-800/70"
      }`}
      style={{
        gridRow: row + 1,
        gridColumn: `${col + 1} / span ${colSpan}`,
      }}
    >
      <div
        data-player-head={player.id}
        className={`flex h-7 shrink-0 items-center gap-2 border-b px-2 transition-colors ${
          headTargeted
            ? "border-emerald-500/80 bg-emerald-950/40"
            : "border-zinc-800/60"
        }`}
      >
        <span
          className={`truncate text-[10px] font-medium uppercase tracking-wider ${
            activeTurn ? "text-emerald-400" : "text-zinc-500"
          }`}
        >
          {player.name}
          {isYou ? " (you)" : ""}
        </span>
        {!player.connected && (
          <span className="shrink-0 text-[10px] text-zinc-600">offline</span>
        )}
        <ManaBar
          mana={player.mana}
          editable={isYou}
          onAdd={onManaAdd}
          onSpend={onManaSpend}
          onClear={onManaClear}
        />
        {onPile && (
          <span className="flex shrink-0 items-center gap-0.5">
            {COUNT_CHIPS.map(({ zone, label, Icon }) => {
              const view = player.zones[zone];
              const count = view.kind === "cards" ? view.cards.length : view.count;
              return (
                <span
                  key={zone}
                  title={`${player.name}'s ${label} (${count})`}
                  className="flex items-center gap-0.5 px-1 py-0.5 font-mono text-[10px] text-zinc-500"
                >
                  <Icon className="h-3 w-3" strokeWidth={1.75} />
                  {count}
                </span>
              );
            })}
            {PILE_CHIPS.map(({ zone, label, Icon }) => {
              const view = player.zones[zone];
              const count = view.kind === "cards" ? view.cards.length : view.count;
              return (
                <button
                  key={zone}
                  onClick={() => onPile(zone)}
                  title={`View ${player.name}'s ${label} (${count})`}
                  className="flex items-center gap-0.5 rounded px-1 py-0.5 font-mono text-[10px] text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                >
                  <Icon className="h-3 w-3" strokeWidth={1.75} />
                  {count}
                </button>
              );
            })}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          {onDuel && (
            <button
              onClick={onDuel}
              title={`Duel view — your board vs ${player.name}'s`}
              className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-emerald-300"
            >
              <Swords className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          )}
          {onFocus && (
            <button
              onClick={onFocus}
              title={`Expand ${isYou ? "your" : `${player.name}'s`} board`}
              className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-emerald-300"
            >
              <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          )}
        </span>
      </div>
      <div
        ref={boardRef}
        onPointerDown={onBoardPointerDown}
        className="relative flex-1 overflow-hidden"
      >
        {cards.map((card) => {
          if (card.attachedTo && byUid.has(card.attachedTo)) return null;
          const stack = attached.get(card.uid) ?? [];
          return (
            <div key={card.uid}>
              <CardSprite
                card={card}
                def={getDef(card.cardId)}
                width={cardWidth}
                image={image}
                centered
                dragging={draggedUid === card.uid}
                arrowTargeted={arrowTargetedUid === card.uid}
                selected={selectedUids.has(card.uid)}
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
                  width={cardWidth}
                  image={image}
                  centered
                  dragging={draggedUid === follower.uid}
                  arrowTargeted={arrowTargetedUid === follower.uid}
                  selected={selectedUids.has(follower.uid)}
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
    </div>
  );
}
