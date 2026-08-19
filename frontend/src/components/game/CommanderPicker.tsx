"use client";

import { useState } from "react";
import type { Action } from "@mythic/shared";
import { searchCommanderCandidates, type CardDef } from "@/lib/scryfall";

/**
 * Pick a commander: typeahead search over commander-eligible cards —
 * legendary creatures plus planeswalkers that say "can be your commander".
 */
export default function CommanderPicker({
  currentName,
  send,
  onClose,
}: {
  currentName: string | null;
  send: (action: Action) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [results, setResults] = useState<CardDef[] | null>(null);
  const [selected, setSelected] = useState<CardDef | null>(null);
  const [busy, setBusy] = useState(false);

  async function search() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      setResults(await searchCommanderCandidates(trimmed));
      setSelected(null);
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    if (!selected) return;
    send({ type: "SET_COMMANDER", cardId: selected.id, name: selected.name });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-zinc-800 px-5 py-3">
          <h2 className="font-semibold text-zinc-100">Choose your commander</h2>
          {currentName && (
            <span className="truncate text-sm text-zinc-500">
              current: {currentName}
            </span>
          )}
          <button
            onClick={onClose}
            className="ml-auto rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close commander picker"
          >
            ✕
          </button>
        </header>

        <div className="p-5">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Atraxa, Krenko, Urza…"
              className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
            />
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="rounded-md bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50"
            >
              {busy ? "…" : "Search"}
            </button>
          </form>
          <p className="mt-2 text-xs text-zinc-600">
            Legendary creatures and planeswalkers that can be your commander.
          </p>

          {results !== null && (
            <ul className="mt-4 grid grid-cols-4 gap-2">
              {results.map((def) => (
                <li key={def.id}>
                  <button
                    onClick={() => setSelected(def)}
                    title={def.name}
                    className={`w-full overflow-hidden rounded-md ring-2 transition ${
                      selected?.id === def.id
                        ? "ring-emerald-500"
                        : "ring-transparent hover:ring-zinc-600"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={def.small} alt={def.name} className="w-full" draggable={false} />
                  </button>
                </li>
              ))}
              {results.length === 0 && (
                <li className="col-span-4 py-3 text-center text-sm text-zinc-500">
                  no commander-eligible card matches that name
                </li>
              )}
            </ul>
          )}

          {selected && (
            <div className="mt-4 flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950/60 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selected.small} alt="" className="h-16 rounded" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-100">{selected.name}</p>
                <p className="truncate text-xs text-zinc-500">{selected.mana_cost} · {selected.type_line}</p>
              </div>
              <button
                onClick={confirm}
                className="ml-auto rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
              >
                Set commander
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
