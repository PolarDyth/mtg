"use client";

import { useState } from "react";
import type { Action, CommanderPick } from "@cardessa/shared";
import { putCards } from "@/lib/cardCache";
import { searchCommanderCandidates, type CardDef } from "@/lib/scryfall";

export type DeckCandidate = { def: CardDef; count: number };

/** Partner pairs cap the command zone — one commander or two. */
const MAX_PICKS = 2;

/**
 * Pick your commander(s). The primary path shows the commander-eligible
 * cards already in your loaded deck (legendary creatures + commander
 * planeswalkers); a search tab covers decks pasted without their commander.
 * One or two picks (partner pairs); confirming commits the whole set.
 */
export default function CommanderPicker({
  current,
  deckCandidates,
  send,
  getDef,
  onClose,
}: {
  /** the actor's current command zone, name-resolved (pre-selected) */
  current: CommanderPick[];
  deckCandidates: DeckCandidate[];
  send: (action: Action) => void;
  /** card-def lookup for rendering picks (Lobby's reactive resolver) */
  getDef: (id: string | null) => CardDef | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"deck" | "search">(deckCandidates.length > 0 ? "deck" : "search");
  const [name, setName] = useState("");
  const [results, setResults] = useState<CardDef[] | null>(null);
  const [selected, setSelected] = useState<CardDef | null>(null);
  const [picked, setPicked] = useState<CommanderPick[]>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await searchCommanderCandidates(trimmed));
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "search failed — try again");
    } finally {
      setBusy(false);
    }
  }

  function togglePick(def: CardDef) {
    // warm the local cache at pick time so the lobby renders the name
    // immediately, even for search-tab picks this client never loaded
    putCards([def]);
    setPicked((prev) => {
      if (prev.some((p) => p.cardId === def.id)) {
        return prev.filter((p) => p.cardId !== def.id);
      }
      if (prev.length >= MAX_PICKS) return prev;
      return [...prev, { cardId: def.id, name: def.name }];
    });
  }

  function removePick(cardId: string) {
    setPicked((prev) => prev.filter((p) => p.cardId !== cardId));
  }

  function confirm() {
    if (picked.length < 1) return;
    send({ type: "SET_COMMANDER", cards: picked });
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
                  Commander-eligible cards in your loaded deck — pick one, or two
                  for a partner pair. Picked cards move from your library to the
                  command zone.
                </p>
                <ul className="grid grid-cols-4 gap-2">
                  {deckCandidates.map(({ def, count }) => {
                    const isPicked = picked.some((p) => p.cardId === def.id);
                    return (
                      <li key={def.id} className="relative">
                        <button
                          onClick={() => togglePick(def)}
                          title={`${def.name} — ${isPicked ? "remove from" : "add to"} your commanders`}
                          className={`w-full overflow-hidden rounded-md ring-2 transition ${
                            isPicked
                              ? "ring-emerald-500"
                              : "ring-transparent hover:ring-zinc-500"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={def.small} alt={def.name} className="w-full" draggable={false} />
                        </button>
                        {isPicked && (
                          <span className="absolute left-1 top-1 rounded bg-emerald-700 px-1.5 text-xs font-semibold text-white">
                            ✓
                          </span>
                        )}
                        {count > 1 && (
                          <span className="absolute right-1 top-1 rounded bg-black/80 px-1.5 text-xs font-semibold text-zinc-200">
                            ×{count}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-center text-xs text-zinc-600">
                  click cards to pick — one, or two partners
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

              {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

              {results !== null && (
                <ul className="mt-4 grid grid-cols-4 gap-2">
                  {results.map((def) => {
                    const isPicked = picked.some((p) => p.cardId === def.id);
                    return (
                      <li key={def.id}>
                        <button
                          onClick={() => {
                            setSelected(def);
                            togglePick(def);
                          }}
                          title={def.name}
                          className={`w-full overflow-hidden rounded-md ring-2 transition ${
                            isPicked
                              ? "ring-emerald-500"
                              : "ring-transparent hover:ring-zinc-600"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={def.small} alt={def.name} className="w-full" draggable={false} />
                        </button>
                      </li>
                    );
                  })}
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
                  <PickToggle def={selected} picked={picked} onToggle={togglePick} />
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex items-center gap-3 border-t border-zinc-800 px-5 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {picked.length === 0 && (
              <span className="text-xs text-zinc-600">
                no commander picked — choose one, or two partners
              </span>
            )}
            {picked.map((pick) => {
              const def = getDef(pick.cardId);
              return (
                <span
                  key={pick.cardId}
                  className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-950/60 py-1 pl-1 pr-1.5 text-xs text-zinc-200"
                >
                  {def && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={def.small} alt="" className="h-8 rounded" draggable={false} />
                  )}
                  <span className="max-w-36 truncate">{pick.name}</span>
                  <button
                    onClick={() => removePick(pick.cardId)}
                    className="text-zinc-500 hover:text-red-300"
                    aria-label={`Remove ${pick.name}`}
                  >
                    ✕
                  </button>
                </span>
              );
            })}
          </div>
          <span className="shrink-0 text-xs text-zinc-500">
            {picked.length}/{MAX_PICKS}
          </span>
          <button
            onClick={confirm}
            disabled={picked.length === 0}
            className="shrink-0 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            Set {picked.length > 1 ? "commanders" : "commander"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function PickToggle({
  def,
  picked,
  onToggle,
}: {
  def: CardDef;
  picked: CommanderPick[];
  onToggle: (def: CardDef) => void;
}) {
  const isPicked = picked.some((p) => p.cardId === def.id);
  const full = !isPicked && picked.length >= MAX_PICKS;
  return (
    <button
      onClick={() => onToggle(def)}
      disabled={full}
      title={full ? "two commanders already picked" : undefined}
      className={`ml-auto shrink-0 rounded-md px-4 py-2 text-sm font-medium ${
        isPicked
          ? "border border-zinc-600 text-zinc-300 hover:border-red-500 hover:text-red-300"
          : "bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-50"
      }`}
    >
      {isPicked ? "Remove" : full ? "Pair full" : "Add"}
    </button>
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
