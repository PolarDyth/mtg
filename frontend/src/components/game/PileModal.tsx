"use client";

import { useState } from "react";
import type { Action, CardView, Zone } from "@mythic/shared";
import type { CardDef } from "@/lib/scryfall";

const ZONE_TITLES: Record<Zone, string> = {
  library: "Library",
  hand: "Hand",
  battlefield: "Battlefield",
  graveyard: "Graveyard",
  exile: "Exile",
  command: "Command zone",
  sideboard: "Sideboard",
};

/**
 * Grid view of a pile's contents — the "search your library" interface.
 * Cards can be sent to hand/battlefield/library (owner only).
 */
export default function PileModal({
  zone,
  cards,
  getDef,
  canAct,
  send,
  onClose,
}: {
  zone: Zone;
  cards: CardView[];
  getDef: (id: string | null) => CardDef | null;
  canAct: boolean;
  send: (action: Action) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [zoom, setZoom] = useState<CardDef | null>(null);

  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? cards.filter((c) => (getDef(c.cardId)?.name ?? "").toLowerCase().includes(needle))
    : cards;

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
            {ZONE_TITLES[zone]}{" "}
            <span className="text-sm font-normal text-zinc-500">({cards.length})</span>
          </h2>
          {zone === "library" && (
            <p className="hidden text-xs text-zinc-500 sm:block">
              listed top to bottom — order is hidden from everyone but you
            </p>
          )}
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter by name…"
            className="ml-auto w-48 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-sm outline-none focus:border-emerald-600"
          />
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close pile view"
          >
            ✕
          </button>
        </header>

        <ul className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2 overflow-y-auto p-4">
          {visible.map((card, i) => {
            const def = getDef(card.cardId);
            const hidden = card.faceDown || !card.cardId;
            return (
              <li
                key={card.uid}
                className="group relative overflow-hidden rounded-md border border-zinc-800 bg-zinc-950"
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
                    onMouseEnter={() => def && setZoom(def)}
                    onMouseLeave={() => setZoom(null)}
                    className="aspect-[146/204] w-full cursor-zoom-in object-cover"
                  />
                )}
                {zone === "library" && i < 4 && (
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[10px] text-zinc-300">
                    {i === 0 ? "top" : i + 1}
                  </span>
                )}
                {canAct && (
                  <div className="absolute inset-x-0 bottom-0 hidden gap-1 bg-gradient-to-t from-black/90 to-transparent p-1 group-hover:flex">
                    <PileButton label="✋" title="to hand" onClick={() => send({ type: "MOVE_CARD", uid: card.uid, to: "hand" })} />
                    <PileButton label="⚔" title="to battlefield" onClick={() => send({ type: "MOVE_CARD", uid: card.uid, to: "battlefield" })} />
                    {(zone === "graveyard" || zone === "exile" || zone === "sideboard" || zone === "command") && (
                      <PileButton label="📚" title="on top of library" onClick={() => send({ type: "MOVE_CARD", uid: card.uid, to: "library", index: 0 })} />
                    )}
                    {zone !== "library" && (
                      <PileButton label="🔍" title="reveal to table" onClick={() => send({ type: "REVEAL_CARDS", cards: [{ uid: card.uid, name: def?.name ?? "Card" }] })} />
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="col-span-full py-10 text-center text-sm text-zinc-600">
              {cards.length === 0 ? "empty pile" : "no cards match the filter"}
            </li>
          )}
        </ul>

        {zoom && (
          <div className="pointer-events-none absolute left-4 top-16 z-10 rounded-lg bg-black/80 p-1 shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoom.normal} alt={zoom.name} className="w-[220px] rounded" />
          </div>
        )}
      </div>
    </div>
  );
}

function PileButton({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex-1 rounded bg-zinc-800/90 py-1 text-xs text-zinc-200 hover:bg-emerald-700"
    >
      {label}
    </button>
  );
}
