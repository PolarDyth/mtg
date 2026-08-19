"use client";

import { useState } from "react";
import type { Action } from "@mythic/shared";
import { searchTokenCards, type CardDef } from "@/lib/scryfall";

/** Create tokens: search Scryfall's token cards, or mint a generic one. */
export default function TokenModal({
  send,
  onClose,
}: {
  send: (action: Action) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [results, setResults] = useState<CardDef[] | null>(null);
  const [selected, setSelected] = useState<CardDef | null>(null);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);

  async function search() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      setResults(await searchTokenCards(trimmed));
      setSelected(null);
    } finally {
      setBusy(false);
    }
  }

  function create() {
    const trimmed = (selected?.name ?? name).trim().slice(0, 64) || "Token";
    send({
      type: "CREATE_TOKEN",
      name: trimmed,
      cardId: selected?.id,
      count,
    });
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
        <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <h2 className="font-semibold text-zinc-100">Create a token</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close token creation"
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
              placeholder="Goblin, Treasure, …"
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

          {results !== null && (
            <ul className="mt-4 grid grid-cols-4 gap-2">
              {results.map((def) => (
                <li key={def.id}>
                  <button
                    onClick={() => setSelected(def)}
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
                  no token found — you can still mint a generic one below
                </li>
              )}
            </ul>
          )}

          <div className="mt-4 flex items-center gap-3">
            <label className="text-sm text-zinc-400">
              Count
              <input
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) =>
                  setCount(Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 1)))
                }
                className="ml-2 w-16 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm outline-none focus:border-emerald-600"
              />
            </label>
            <button
              onClick={create}
              disabled={!name.trim() && !selected}
              className="ml-auto rounded-md bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              Create
            </button>
          </div>
          <p className="mt-3 text-xs text-zinc-600">
            Creating without a selected image mints a labeled generic token.
          </p>
        </div>
      </div>
    </div>
  );
}
