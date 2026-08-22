"use client";

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import type { Action, CardView, Zone } from "@mythic/shared";
import type { CardDef } from "@/lib/scryfall";
import { PREVIEW_DEFAULT } from "@/lib/settings";
import { Eye, Hand, Layers, Swords } from "lucide-react";
import CardPreview from "./CardPreview";
import { cardMatchesText, faceDef } from "./table/foundation";

const ZONE_TITLES: Record<Zone, string> = {
  library: "Library",
  hand: "Hand",
  battlefield: "Battlefield",
  graveyard: "Graveyard",
  exile: "Exile",
  command: "Command zone",
  sideboard: "Sideboard",
};

/** Group destinations inside the viewer, labeled like the card menu. */
type GroupDest = { label: string; build: (uid: string) => Action };

const move = (uid: string, to: Zone, index?: "top" | "bottom"): Action => ({
  type: "MOVE_CARD",
  uid,
  to,
  ...(index !== undefined ? { index } : {}),
});

/**
 * Grid view of a pile's contents — also the "search your library" interface.
 * Cards can be moved individually (hover buttons), right-clicked for the full
 * card menu, or selected in bulk and moved together. Opponents' public piles
 * open read-only.
 */
export default function PileModal({
  zone,
  cards,
  getDef,
  canAct,
  send,
  onClose,
  playerName,
  highlightTop,
  onCardContextMenu,
  previewWidth = PREVIEW_DEFAULT,
  onRevealTo,
}: {
  zone: Zone;
  cards: CardView[];
  getDef: (id: string | null) => CardDef | null;
  canAct: boolean;
  send: (action: Action) => void;
  onClose: () => void;
  /** whose pile this is (opponents' public piles open read-only) */
  playerName?: string;
  /** show only the top N cards — the "look at top N" surface (closing doesn't shuffle) */
  highlightTop?: number;
  onCardContextMenu?: (card: CardView, event: ReactMouseEvent) => void;
  /** width of the hover preview bubble (user preference) */
  previewWidth?: number;
  /** opens the reveal audience picker for the given cards */
  onRevealTo?: (cards: CardView[]) => void;
}) {
  const [filter, setFilter] = useState("");
  const [zoom, setZoom] = useState<CardDef | null>(null);
  const [selectActive, setSelectActive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  // "look at top N": only the looked-at cards render — the rest of the
  // library stays unseen instead of dimmed-but-visible
  const scope = highlightTop !== undefined ? cards.slice(0, highlightTop) : cards;
  const visible = scope.filter((c) => cardMatchesText(getDef(c.cardId), filter));
  const position = new Map(scope.map((c, i) => [c.uid, i]));
  // snapshot updates can remove cards — never act on stale uids
  const selectedIds = [...selected].filter((uid) => scope.some((c) => c.uid === uid));

  function toggleSelectMode() {
    if (selectActive) setSelected(new Set());
    setSelectActive(!selectActive);
  }

  function toggleSelected(card: CardView) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(card.uid)) next.delete(card.uid);
      else next.add(card.uid);
      return next;
    });
  }

  function runGroup(build: (uid: string) => Action) {
    if (selectedIds.length === 0) return;
    for (const uid of selectedIds) send(build(uid));
    setSelected(new Set());
    setSelectActive(false);
  }

  const groupDestinations: GroupDest[] = [
    { label: "to hand", build: (uid: string) => move(uid, "hand") },
    { label: "to battlefield", build: (uid: string) => move(uid, "battlefield") },
    ...(zone !== "library"
      ? [
          { label: "top of library", build: (uid: string) => move(uid, "library", "top") },
          { label: "bottom of library", build: (uid: string) => move(uid, "library", "bottom") },
        ]
      : []),
    ...(zone !== "graveyard"
      ? [{ label: "to graveyard", build: (uid: string) => move(uid, "graveyard") }]
      : []),
    ...(zone !== "exile"
      ? [{ label: "to exile", build: (uid: string) => move(uid, "exile") }]
      : []),
  ];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-zinc-800 px-5 py-3">
          <h2 className="font-semibold text-zinc-100">
            {playerName ? `${playerName} — ` : ""}
            {ZONE_TITLES[zone]}{" "}
            <span className="text-sm font-normal text-zinc-500">
              {highlightTop !== undefined
                ? `top ${scope.length} of ${cards.length}`
                : `(${cards.length})`}
            </span>
          </h2>
          {zone === "library" && (
            <p className="hidden text-xs text-zinc-500 sm:block">
              {playerName
                ? "listed top to bottom"
                : "listed top to bottom — order is hidden from everyone but you"}
            </p>
          )}
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter by name, type, or rules text…"
            className="ml-auto w-48 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-sm outline-none focus:border-emerald-600"
          />
          {canAct && (
            <button
              onClick={toggleSelectMode}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                selectActive
                  ? "border-emerald-600 bg-emerald-800/60 text-emerald-200"
                  : "border-zinc-700 bg-zinc-900/80 text-zinc-400 hover:border-emerald-700 hover:text-zinc-200"
              }`}
            >
              {selectActive ? "Done" : "Select"}
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close pile view"
          >
            ✕
          </button>
        </header>

        <ul className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2 overflow-y-auto p-4">
          {visible.map((card) => {
            const def = faceDef(getDef(card.cardId), card.showBack);
            const hidden = card.faceDown || !card.cardId;
            const i = position.get(card.uid) ?? 0;
            const isSelected = selected.has(card.uid);
            return (
              <li
                key={card.uid}
                onClick={() => selectActive && toggleSelected(card)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onCardContextMenu?.(card, e);
                }}
                onMouseEnter={() => def && setZoom(def)}
                onMouseLeave={() => setZoom(null)}
                className={`group relative overflow-hidden rounded-md border bg-zinc-950 transition-all ${
                  isSelected
                    ? "-translate-y-1 border-emerald-500 ring-2 ring-emerald-500"
                    : "border-zinc-800"
                } ${selectActive ? "cursor-pointer" : ""}`}
              >
                {hidden ? (
                  <div className="flex aspect-[146/204] items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950 text-xs text-zinc-600">
                    {card.annotations[0] ?? "face down"}
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={def?.small}
                    alt={def?.name ?? "card"}
                    draggable={false}
                    className="aspect-[146/204] w-full object-cover"
                  />
                )}
                {zone === "library" && i < 4 && (
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[10px] text-zinc-300">
                    {i === 0 ? "top" : i + 1}
                  </span>
                )}
                {selectActive && isSelected && (
                  <span className="absolute right-1 top-1 rounded-full bg-emerald-600 px-1.5 text-[10px] font-semibold text-white">
                    ✓
                  </span>
                )}
                {canAct && !selectActive && (
                  <div className="absolute inset-x-0 bottom-0 hidden gap-1 bg-gradient-to-t from-black/90 to-transparent p-1 group-hover:flex">
                    <PileButton label="to hand" Icon={Hand} onClick={() => send({ type: "MOVE_CARD", uid: card.uid, to: "hand" })} />
                    <PileButton label="to battlefield" Icon={Swords} onClick={() => send({ type: "MOVE_CARD", uid: card.uid, to: "battlefield" })} />
                    {(zone === "graveyard" || zone === "exile" || zone === "sideboard" || zone === "command") && (
                      <>
                        <PileButton label="on top of library" Icon={Layers} onClick={() => send({ type: "MOVE_CARD", uid: card.uid, to: "library", index: "top" })} />
                        <PileButton label="on bottom of library" Icon={Layers} onClick={() => send({ type: "MOVE_CARD", uid: card.uid, to: "library", index: "bottom" })} />
                      </>
                    )}
                    {zone !== "library" && (
                      <PileButton label="reveal to table" Icon={Eye} onClick={() => send({ type: "REVEAL_CARDS", cards: [{ uid: card.uid, name: def?.name ?? "Card" }] })} />
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="col-span-full py-10 text-center text-sm text-zinc-600">
              {scope.length === 0 ? "empty pile" : "no cards match the filter"}
            </li>
          )}
        </ul>

        {canAct && selectActive && (
          <div className="flex items-center gap-2 border-t border-zinc-800 px-5 py-2.5 text-xs">
            <span className="text-zinc-500">{selectedIds.length} selected</span>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
              {groupDestinations.map((dest) => (
                <button
                  key={dest.label}
                  disabled={!selectedIds.length}
                  onClick={() => runGroup(dest.build)}
                  className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 transition-colors hover:border-emerald-600 hover:text-white disabled:opacity-40 disabled:hover:border-zinc-700"
                >
                  {dest.label}
                </button>
              ))}
              {onRevealTo && (
                <button
                  disabled={!selectedIds.length}
                  onClick={() => {
                    onRevealTo(scope.filter((c) => selected.has(c.uid)));
                    setSelected(new Set());
                    setSelectActive(false);
                  }}
                  className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-emerald-300 transition-colors hover:border-emerald-600 hover:text-white disabled:opacity-40 disabled:hover:border-zinc-700"
                >
                  reveal to…
                </button>
              )}
            </div>
          </div>
        )}

        {zone === "library" && canAct && (
          <footer className="flex items-center gap-2 border-t border-zinc-800 px-5 py-2.5">
            <span className="text-xs text-zinc-600">
              {highlightTop !== undefined
                ? "just looking — closing won't shuffle"
                : "closing the viewer shuffles your library — the natural end of a search"}
            </span>
            <button
              onClick={() => send({ type: "DRAW_CARDS", count: 1 })}
              className="ml-auto rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-emerald-600"
            >
              Draw 1
            </button>
          </footer>
        )}

        {zoom && (
          <CardPreview def={zoom} width={previewWidth} className="absolute left-4 top-16 z-10" />
        )}
      </div>
    </div>
  );
}

function PileButton({
  label,
  Icon,
  onClick,
}: {
  label: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick: () => void;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex flex-1 items-center justify-center rounded bg-zinc-800/90 py-1 text-zinc-200 hover:bg-emerald-700"
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );
}
