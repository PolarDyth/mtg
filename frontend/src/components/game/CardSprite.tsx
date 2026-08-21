"use client";

import { memo, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { CardView } from "@mythic/shared";
import type { CardDef } from "@/lib/scryfall";

export const CARD_RATIO = 204 / 146; // scryfall small image

type Props = {
  card: CardView;
  def: CardDef | null;
  width: number;
  /** which Scryfall CDN size to render (normal for focused-board widths) */
  image?: "small" | "normal";
  className?: string;
  dragging?: boolean;
  attachedStackIndex?: number;
  /** highlighted as the hovered target of an arrow being drawn */
  arrowTargeted?: boolean;
  /** left/top % refer to the card's center (battlefield placement). */
  centered?: boolean;
  onCardPointerDown?: (card: CardView, event: ReactPointerEvent) => void;
  onCardContextMenu?: (card: CardView, event: ReactMouseEvent) => void;
  /** card is null for hidden cards and on leave — defs alone can't drive
   *  hovered-card shortcuts, which need the uid */
  onCardHover?: (def: CardDef | null, card: CardView | null) => void;
  style?: React.CSSProperties;
};

/** Compact chip label for a counter kind. */
function counterChipLabel(kind: string): string {
  if (kind === "+1/+1") return "+1";
  if (kind === "-1/-1") return "−1";
  return kind.length > 4 ? `${kind.slice(0, 3)}…` : kind;
}

/** Power counters scan differently across a board, so they get their own
 *  corner: +1/+1 and −1/−1 sit bottom-right, everything else top-left. */
const POWER_KINDS = new Set(["+1/+1", "-1/-1"]);

/** One chip per counter kind (up to 3 + an overflow chip), so a card with
 *  +1/+1 ×3 and Lore ×2 shows both kinds instead of one summed number. */
function ChipCluster({
  counters,
  kinds,
  allKinds,
  className,
}: {
  counters: Record<string, number>;
  kinds: string[];
  allKinds: string[];
  className: string;
}) {
  if (kinds.length === 0) return null;
  const visible = kinds.slice(0, 3);
  const overflow = kinds.length - visible.length;
  return (
    <span
      title={allKinds.map((k) => `${k}: ${counters[k]}`).join("\n")}
      className={`absolute flex flex-col gap-0.5 ${className}`}
    >
      {visible.map((kind) => (
        <span
          key={kind}
          className={`flex h-4 items-center rounded-full border px-1.5 text-[9px] font-bold leading-none shadow ${
            POWER_KINDS.has(kind)
              ? "border-emerald-300/70 bg-emerald-800 text-emerald-100"
              : "border-emerald-400/60 bg-emerald-900 text-emerald-200"
          }`}
        >
          {counterChipLabel(kind)} ×{counters[kind]}
        </span>
      ))}
      {overflow > 0 && (
        <span className="flex h-4 items-center rounded-full border border-emerald-400/60 bg-emerald-900 px-1.5 text-[9px] font-bold leading-none text-emerald-200 shadow">
          +{overflow}
        </span>
      )}
    </span>
  );
}

function CounterChips({ counters }: { counters: Record<string, number> }) {
  const kinds = Object.keys(counters);
  if (kinds.length === 0) return null;
  const power = kinds.filter((k) => POWER_KINDS.has(k));
  const other = kinds.filter((k) => !POWER_KINDS.has(k));
  return (
    <>
      <ChipCluster counters={counters} kinds={other} allKinds={kinds} className="-top-1.5 -left-1.5 items-start" />
      <ChipCluster counters={counters} kinds={power} allKinds={kinds} className="-bottom-1.5 -right-1.5 items-end" />
    </>
  );
}

/** A single card: image, tap rotation, counters, face-down back. */
const CardSprite = memo(function CardSprite({
  card,
  def,
  width,
  image = "small",
  className = "",
  dragging = false,
  attachedStackIndex,
  arrowTargeted = false,
  centered = false,
  onCardPointerDown,
  onCardContextMenu,
  onCardHover,
  style,
}: Props) {
  const height = Math.round(width * CARD_RATIO);
  const hidden = card.faceDown || !card.cardId;

  return (
    <div
      data-card-uid={card.uid}
      onPointerDown={onCardPointerDown ? (e) => onCardPointerDown(card, e) : undefined}
      onContextMenu={
        onCardContextMenu ? (e) => onCardContextMenu(card, e) : undefined
      }
      onMouseEnter={
        onCardHover ? () => onCardHover(hidden ? null : def, card) : undefined
      }
      onMouseLeave={onCardHover ? () => onCardHover(null, null) : undefined}
      className={`absolute select-none touch-none ${
        onCardPointerDown ? "cursor-grab active:cursor-grabbing" : ""
      } ${dragging ? "opacity-30" : "hover:brightness-110"} ${
        arrowTargeted ? "rounded-md ring-2 ring-emerald-400 brightness-110" : ""
      } ${className}`}
      style={{
        width,
        height,
        transform: [
          centered ? "translate(-50%, -50%)" : "",
          `rotate(${card.tapped ? 90 : 0}deg)`,
          attachedStackIndex !== undefined
            ? `translate(${-attachedStackIndex * 18}%, ${-attachedStackIndex * 26}%)`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
        transformOrigin: "center",
        zIndex: attachedStackIndex !== undefined ? 1 : 2,
        ...style,
      }}
    >
      {hidden ? (
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-md border border-zinc-600 bg-[radial-gradient(circle_at_50%_35%,#3f2d52,#191024_70%)] shadow-md">
          <span className="rotate-[-20deg] font-serif text-lg font-bold text-zinc-500">
            MT
          </span>
        </div>
      ) : def ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image === "normal" ? def.normal : def.small}
          alt={def.name}
          draggable={false}
          className="h-full w-full rounded-md object-cover shadow-md pointer-events-none"
        />
      ) : (
        <div
          title={card.annotations[0] ?? ""}
          className="flex h-full w-full items-center justify-center rounded-md border border-amber-700/70 bg-gradient-to-br from-amber-950 to-zinc-900 p-1 text-center text-[10px] leading-tight text-amber-200 shadow-md"
        >
          {card.annotations[0] ?? "unknown card"}
        </div>
      )}
      <CounterChips counters={card.counters} />
      {/* attach + note share the top-right so the bottom-right stays the
          power-counter corner */}
      {(card.attachedTo || (card.annotations.length > 0 && !hidden)) && (
        <span className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 text-xs">
          {card.attachedTo && (
            <span title="attached">🔗</span>
          )}
          {card.annotations.length > 0 && !hidden && (
            <span title={card.annotations.join(" · ")}>📝</span>
          )}
        </span>
      )}
    </div>
  );
});

export default CardSprite;
