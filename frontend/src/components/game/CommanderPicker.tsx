"use client";

import { useState } from "react";
import type { Action } from "@mythic/shared";
import { searchCommanderCandidates, type CardDef } from "@/lib/scryfall";

export type DeckCandidate = { def: CardDef; count: number };

/**
 * Pick a commander. The primary path shows the commander-eligible cards
 * already in your loaded deck (legendary creatures + commander
 * planeswalkers); a search tab covers decks pasted without their commander.
 */
export default function CommanderPicker({
  currentName,
  deckCandidates,
  send,
  onClose,
}: {
  currentName: string | null;
  deckCandidates: DeckCandidate[];
  send: (action: Action) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"deck" | "search">(deckCandidates.length > 0 ? "deck" : "search");
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

  function confirm(def: CardDef | null) {
    if (!def) return;
    send({ type: "SET_COMMANDER", cardId: def.id, name: def.name });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
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

        <div className="flex gap-1 border-b border-zinc-800 px-5 pt-3">
          <TabButton active={tab === "deck"} onClick={() => setTab("deck")}>
            From your deck ({deckCandidates.length})
          </TabButton>
          <TabButton active={tab === "search"} onClick={() => setTab("search")}>
            Search
          </TabButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === "deck" ? (
            deckCandidates.length > 0 ? (
              <>
                <p className="mb-3 text-xs text-zinc-500">
                  Commander-eligible cards in your loaded deck — picking one
                  moves it from your library to the command zone.
                </p>
                <ul className="grid grid-cols-4 gap-2">
                  {deckCandidates.map(({ def, count }) => (
                    <li key={def.id} className="relative">
                      <button
                        onClick={() => confirm(def)}
                        title={`${def.name} — set as commander`}
                        className={`w-full overflow-hidden rounded-md ring-2 transition ${
                          selected?.id === def.id
                            ? "ring-emerald-500"
                            : "ring-transparent hover:ring-zinc-500"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={def.small} alt={def.name} className="w-full" draggable={false} />
                      </button>
                      {count > 1 && (
                        <span className="absolute right-1 top-1 rounded bg-black/80 px-1.5 text-xs font-semibold text-zinc-200">
                          ×{count}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-center text-xs text-zinc-600">
                  click a card to make it your commander
                </p>
              </>
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-zinc-400">
                  No legendary creatures or commander planeswalkers in your
                  loaded deck.
                </p>
                <button
                  onClick={() => setTab("search")}
                  className="mt-3 rounded-md bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
                >
                  Search Scryfall instead
                </button>
              </div>
            )
          ) : (
            <>
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
                    <p className="truncate text-xs text-zinc-500">
                      {selected.mana_cost} · {selected.type_line}
                    </p>
                  </div>
                  <button
                    onClick={() => confirm(selected)}
                    className="ml-auto rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
                  >
                    Set commander
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-t-md border-b-2 px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-emerald-500 text-zinc-100"
          : "border-transparent text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}
