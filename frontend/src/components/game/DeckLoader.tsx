"use client";

import { useMemo, useState } from "react";
import type { DeckEntry } from "@mythic/shared";
import { mergeDuplicates, parseDecklist, totalCards } from "@/lib/decklist";
import { getCardByName, putCards } from "@/lib/cardCache";
import { resolveCards, type CardDef } from "@/lib/scryfall";

const LAST_DECK_KEY = "mtg:lastDeck";

type Phase = "paste" | "resolving" | "review";

export default function DeckLoader({
  started,
  onLoad,
  onClose,
}: {
  started: boolean;
  onLoad: (library: DeckEntry[], sideboard: DeckEntry[]) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("paste");
  const [text, setText] = useState(() => localStorage.getItem(LAST_DECK_KEY) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Map<string, CardDef>>(new Map());
  const [missing, setMissing] = useState<string[]>([]);
  // names resolved only via Scryfall's fuzzy search — flagged in the review
  // list so a wrong fuzzy hit is visible before loading
  const [fuzzy, setFuzzy] = useState<Set<string>>(() => new Set());

  const parsed = useMemo(() => parseDecklist(text), [text]);
  const mainMerged = useMemo(() => mergeDuplicates(parsed.main), [parsed]);
  const sideMerged = useMemo(() => mergeDuplicates(parsed.side), [parsed]);

  const entries = useMemo(() => {
    const toEntries = (lines: typeof mainMerged): DeckEntry[] =>
      lines
        .map((line) => {
          const def = resolved.get(line.name) ?? getCardByName(line.name);
          return def ? { cardId: def.id, count: line.quantity } : null;
        })
        .filter((e): e is DeckEntry => e !== null);
    return {
      library: toEntries(mainMerged),
      sideboard: toEntries(sideMerged),
    };
  }, [mainMerged, sideMerged, resolved]);

  const libraryTotal = entries.library.reduce((sum, e) => sum + e.count, 0);
  const sideTotal = entries.sideboard.reduce((sum, e) => sum + e.count, 0);

  async function resolve() {
    setPhase("resolving");
    setError(null);
    try {
      const names = [...mainMerged, ...sideMerged].map((line) => line.name);
      const result = await resolveCards(names);
      putCards([...result.defs.values()]);
      setResolved(result.defs);
      setMissing(result.missing);
      setFuzzy(new Set(result.fuzzy));
      setPhase("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "resolution failed");
      setPhase("paste");
    }
  }

  function load() {
    localStorage.setItem(LAST_DECK_KEY, text);
    onLoad(entries.library, entries.sideboard);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <h2 className="font-semibold text-zinc-100">Load a deck</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close deck loader"
          >
            ✕
          </button>
        </header>

        {phase === "paste" && (
          <div className="flex flex-1 flex-col gap-3 p-5">
            <p className="text-sm text-zinc-400">
              Paste a decklist — quantity-name lines from Scryfall, Moxfield,
              Archidekt, or plain text with a Sideboard section.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"4 Lightning Bolt\n20 Mountain\n\nSideboard\n2 Red Elemental Blast"}
              rows={12}
              className="w-full flex-1 resize-none rounded-md border border-zinc-700 bg-zinc-950 p-3 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-emerald-600"
            />
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">
                {totalCards(parsed.main)} main · {totalCards(parsed.side)} side
                {parsed.unparseable.length > 0 &&
                  ` · ${parsed.unparseable.length} unreadable line(s)`}
              </span>
              <button
                onClick={resolve}
                disabled={totalCards(parsed.main) + totalCards(parsed.side) === 0}
                className="ml-auto rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                Resolve with Scryfall
              </button>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        )}

        {phase === "resolving" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-500" />
            <p className="text-sm text-zinc-400">
              Talking to Scryfall — resolving{" "}
              {mainMerged.length + sideMerged.length} unique names…
            </p>
          </div>
        )}

        {phase === "review" && (
          <div className="flex flex-1 flex-col overflow-hidden p-5">
            {missing.length > 0 && (
              <div className="mb-4 rounded-md border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-200">
                <p className="font-medium">
                  {missing.length} name{missing.length > 1 ? "s" : ""} not found
                  — fix the spelling and re-resolve, or load without them:
                </p>
                <p className="mt-1 font-mono text-xs text-amber-300/80">
                  {missing.join(" · ")}
                </p>
              </div>
            )}

            <div className="grid flex-1 grid-cols-2 gap-4 overflow-hidden">
              <BoardList
                title={`Library — ${libraryTotal} cards`}
                lines={mainMerged}
                resolved={resolved}
                fuzzy={fuzzy}
              />
              <BoardList
                title={`Sideboard — ${sideTotal} cards`}
                lines={sideMerged}
                resolved={resolved}
                fuzzy={fuzzy}
              />
            </div>

            {started && (
              <p className="mt-3 rounded-md border border-amber-800 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
                The game has started — loading replaces your library and
                sideboard wholesale.
              </p>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => setPhase("paste")}
                className="rounded-md bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
              >
                Back
              </button>
              <button
                onClick={load}
                disabled={libraryTotal === 0 && sideTotal === 0}
                className="ml-auto rounded-md bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                Load deck
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BoardList({
  title,
  lines,
  resolved,
  fuzzy,
}: {
  title: string;
  lines: { quantity: number; name: string }[];
  resolved: Map<string, CardDef>;
  fuzzy: Set<string>;
}) {
  return (
    <section className="flex min-h-0 flex-col">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {title}
      </h3>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 text-sm">
        {lines.map((line) => {
          const def = resolved.get(line.name) ?? getCardByName(line.name);
          return (
            <li
              key={line.name}
              className={`flex items-center gap-2 rounded px-2 py-1 ${
                def ? "bg-zinc-950/60 text-zinc-200" : "bg-red-950/30 text-red-300"
              }`}
            >
              <span className="w-6 text-right font-mono text-zinc-500">
                {line.quantity}
              </span>
              <span className="truncate">{def?.name ?? line.name}</span>
              {def && fuzzy.has(line.name) && (
                <span
                  title="matched via Scryfall fuzzy search — check it's the right card"
                  className="shrink-0 rounded bg-amber-950/50 px-1 text-[10px] text-amber-300/80"
                >
                  search
                </span>
              )}
              {def?.mana_cost && (
                <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-500">
                  {def.mana_cost}
                </span>
              )}
            </li>
          );
        })}
        {lines.length === 0 && (
          <li className="px-2 py-1 text-sm text-zinc-600">empty</li>
        )}
      </ul>
    </section>
  );
}
