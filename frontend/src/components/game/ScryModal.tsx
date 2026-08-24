"use client";

import { useState } from "react";
import type { Action, CardView } from "@cardessa/shared";
import type { CardDef } from "@/lib/scryfall";
import { PREVIEW_DEFAULT } from "@/lib/settings";
import CardPreview from "./CardPreview";
import { faceDef } from "./table/foundation";

/**
 * Arranges the top of the library for SCRY (top/bottom) or SURVEIL
 * (top/graveyard). Nothing is sent until confirm — looking is free since
 * your library order is only ever visible to you.
 */
export default function ScryModal({
  mode,
  cards,
  getDef,
  send,
  onClose,
  previewWidth = PREVIEW_DEFAULT,
}: {
  mode: "scry" | "surveil";
  cards: CardView[];
  getDef: (id: string | null) => CardDef | null;
  send: (action: Action) => void;
  onClose: () => void;
  /** width of the hover preview bubble (user preference) */
  previewWidth?: number;
}) {
  // leftmost = topmost; arrows slide a card through the sequence
  const [seq, setSeq] = useState<string[]>(() => cards.map((c) => c.uid));
  const [keep, setKeep] = useState<Record<string, boolean>>({});
  const [zoom, setZoom] = useState<CardDef | null>(null);

  const isScry = mode === "scry";
  const otherLabel = isScry ? "Bottom" : "Graveyard";
  const topUids = seq.filter((uid) => keep[uid] !== false);
  const otherUids = seq.filter((uid) => keep[uid] === false);

  function slide(uid: string, delta: -1 | 1) {
    setSeq((prev) => {
      const i = prev.indexOf(uid);
      const j = i + delta;
      if (i === -1 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function confirm() {
    send(
      isScry
        ? { type: "SCRY", look: cards.length, top: topUids, bottom: otherUids }
        : { type: "SURVEIL", look: cards.length, top: topUids, graveyard: otherUids }
    );
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="overlay-in flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-zinc-800 px-5 py-3">
          <h2 className="font-semibold text-zinc-100">
            {isScry ? "Scry" : "Surveil"} {cards.length}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            leftmost ends up topmost — arrows reorder, buttons choose each card&apos;s destination
          </p>
        </header>

        {cards.length === 0 ? (
          <p className="p-10 text-center text-sm text-zinc-500">your library is empty</p>
        ) : (
          <div className="flex flex-1 gap-3 overflow-x-auto p-4">
            {seq.map((uid, i) => {
              const card = cards.find((c) => c.uid === uid);
              if (!card) return null;
              const def = faceDef(getDef(card.cardId), card.showBack);
              const onTop = keep[uid] !== false;
              return (
                <div key={uid} className="flex w-28 shrink-0 flex-col gap-1.5">
                  <div
                    className="relative"
                    onMouseEnter={() => def && setZoom(def)}
                    onMouseLeave={() => setZoom(null)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={def?.small}
                      alt={def?.name ?? "card"}
                      draggable={false}
                      className={`aspect-[146/204] w-full rounded-md border object-cover ${
                        onTop ? "border-emerald-700" : "border-zinc-700 opacity-70"
                      }`}
                    />
                    <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[10px] text-zinc-300">
                      {i === 0 ? "top" : i + 1}
                    </span>
                  </div>
                  <div className="flex justify-center gap-1">
                    <button
                      onClick={() => slide(uid, -1)}
                      disabled={i === 0}
                      className="rounded bg-zinc-800 px-2 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-30"
                      aria-label="move earlier"
                    >
                      ◀
                    </button>
                    <button
                      onClick={() => slide(uid, 1)}
                      disabled={i === seq.length - 1}
                      className="rounded bg-zinc-800 px-2 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-30"
                      aria-label="move later"
                    >
                      ▶
                    </button>
                  </div>
                  <div className="flex rounded-md border border-zinc-700 text-[11px]">
                    <button
                      onClick={() => setKeep((prev) => ({ ...prev, [uid]: true }))}
                      className={`flex-1 rounded-l-md py-1 ${
                        onTop ? "bg-emerald-700 text-white" : "text-zinc-400 hover:bg-zinc-800"
                      }`}
                    >
                      Top
                    </button>
                    <button
                      onClick={() => setKeep((prev) => ({ ...prev, [uid]: false }))}
                      className={`flex-1 rounded-r-md py-1 ${
                        !onTop ? "bg-emerald-700 text-white" : "text-zinc-400 hover:bg-zinc-800"
                      }`}
                    >
                      {otherLabel}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <footer className="flex items-center gap-3 border-t border-zinc-800 px-5 py-3">
          <p className="text-xs text-zinc-500">
            {topUids.length} on top · {otherUids.length} {isScry ? "on bottom" : "to graveyard"}
          </p>
          <div className="ml-auto flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500"
            >
              Cancel
            </button>
            <button
              onClick={confirm}
              disabled={cards.length === 0}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
            >
              {isScry ? "Scry" : "Surveil"} {cards.length} — {topUids.length} on top,{" "}
              {otherUids.length} {isScry ? "on bottom" : "to graveyard"}
            </button>
          </div>
        </footer>
      </div>

      {zoom && (
        <CardPreview
          def={zoom}
          width={previewWidth}
          className="fixed z-50"
          style={{
            // left of the centered max-w-3xl panel (clamped to the viewport)
            left: `max(8px, calc(50% - ${384 + previewWidth + 12}px))`,
            top: "50%",
            transform: "translateY(-50%)",
          }}
        />
      )}
    </div>
  );
}
