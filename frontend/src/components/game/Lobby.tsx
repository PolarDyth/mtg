"use client";

import { useMemo, useState } from "react";
import type { Action, Format, GameView, PlayerId } from "@cardessa/shared";
import type { CardDef } from "@/lib/scryfall";
import { Crown } from "lucide-react";
import { getCardById } from "@/lib/cardCache";
import { useCardDefs } from "@/lib/useCardDefs";
import { ChatInput, ChatLog, nameColor } from "./ChatLog";
import CommanderPicker, { type DeckCandidate } from "./CommanderPicker";
import DeckLoader from "./DeckLoader";

const FORMATS: { value: Format; label: string; detail: string }[] = [
  { value: "freeform", label: "Freeform", detail: "20 life, anything goes" },
  { value: "commander", label: "Commander", detail: "40 life, command zone" },
];

/** A commander's display name: the def when resolvable, else the server's
 *  † annotation (marker stripped) as the fallback. */
function commanderName(
  get: (id: string | null) => CardDef | null,
  cardId: string | null,
  annotation: string | undefined
): string | null {
  return (
    (cardId ? get(cardId)?.name : undefined) ??
    annotation?.replace(/^†/, "") ??
    null
  );
}

export default function Lobby({
  view,
  you,
  send,
  onLeave,
}: {
  view: GameView;
  you: PlayerId | null;
  send: (action: Action) => void;
  /** confirm + LEAVE_GAME + navigate home (owned by GameClient) */
  onLeave: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);
  const [commanderOpen, setCommanderOpen] = useState(false);
  const [format, setFormat] = useState<Format>("freeform");
  // set once someone tries to start while a player has no deck — warn, but
  // never block (structural-only philosophy)
  const [confirmStart, setConfirmStart] = useState(false);

  const decked = view.players.filter((p) => p.hasDeck);
  const deckless = view.players.filter((p) => !p.hasDeck);

  function start() {
    if (deckless.length > 0 && !confirmStart) {
      setConfirmStart(true);
      return;
    }
    setConfirmStart(false);
    send({ type: "START_GAME", format });
  }

  const self = view.players.find((p) => p.id === you);
  const commandCards =
    self?.zones.command.kind === "cards" ? self.zones.command.cards : [];
  // Commanders may be cards this client never loaded — resolve their defs
  // reactively (batch Scryfall fetch on miss) instead of a sync cache read
  // that blanks other players' rows. The † annotation is the server-side
  // name fallback until the def arrives.
  const commanderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const player of view.players) {
      const zone = player.zones.command;
      if (zone.kind !== "cards") continue;
      for (const card of zone.cards) {
        if (card.cardId) ids.add(card.cardId);
      }
    }
    return ids;
  }, [view.players]);
  const { get } = useCardDefs(commanderIds);
  const commanderLabel = commandCards
    .map((card) => commanderName(get, card.cardId, card.annotations[0]))
    .filter((name): name is string => name !== null)
    .join(" + ");

  // commander-eligible cards currently sitting in your library/sideboard.
  // Plain computation (no manual useMemo): the React Compiler memoizes it
  // automatically — a manual memo here can't be preserved once commandCards
  // is iterated for the picker's `current` prop, and the linter errors.
  const deckCandidates: DeckCandidate[] = (() => {
    if (!self) return [];
    const counts = new Map<string, number>();
    for (const zone of [self.zones.library, self.zones.sideboard]) {
      if (zone.kind !== "cards") continue;
      for (const card of zone.cards) {
        if (card.cardId) counts.set(card.cardId, (counts.get(card.cardId) ?? 0) + 1);
      }
    }
    const candidates: DeckCandidate[] = [];
    for (const [cardId, count] of counts) {
      const def = getCardById(cardId);
      if (def?.commanderEligible) candidates.push({ def, count });
    }
    return candidates.sort((a, b) => a.def.name.localeCompare(b.def.name));
  })();

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(view.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the code is displayed anyway
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6">
      <header className="text-center">
        <h1 className="font-serif text-2xl text-zinc-100">Waiting room</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Share this code with your friends - {view.players.length} seated
        </p>
        <button
          onClick={copyCode}
          title="Copy room code"
          className="mt-3 inline-flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-5 py-2.5 font-mono text-2xl tracking-widest text-emerald-300 hover:border-emerald-600"
        >
          {view.code}
          <span className="text-xs font-sans text-zinc-500">
            {copied ? "copied!" : "copy"}
          </span>
        </button>
      </header>

      <div className="grid flex-1 grid-cols-[1fr_300px] items-start gap-4">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Players
          </h2>
          <ul className="space-y-2">
            {view.players.map((player) => {
              const command =
                player.zones.command.kind === "cards" ? player.zones.command.cards : [];
              const names = command
                .map((card) => commanderName(get, card.cardId, card.annotations[0]))
                .filter((name): name is string => name !== null);
              const hasCommander = command.length > 0;
              return (
                <li
                  key={player.id}
                  className="flex items-center gap-3 rounded-lg bg-zinc-950/60 px-4 py-3"
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      player.connected ? "bg-emerald-500" : "bg-zinc-600"
                    }`}
                    title={player.connected ? "connected" : "disconnected"}
                  />
                  <span className="font-medium" style={{ color: nameColor(player.id) }}>
                    {player.name}
                  </span>
                  {player.id === you && (
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                      you
                    </span>
                  )}
                  {hasCommander && (
                    <span
                      className="flex min-w-0 items-center gap-1 text-xs text-zinc-500"
                      title={`${names.join(" + ") || "Commander"} — commander${command.length > 1 ? "s" : ""}`}
                    >
                      <Crown className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                      <span className="truncate">{names.join(" + ") || "Commander"}</span>
                    </span>
                  )}
                  <span className="ml-auto text-xs text-zinc-500">
                    {player.hasDeck ? "🂠 deck ready" : "no deck yet"}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setDeckOpen(true)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:border-emerald-600"
            >
              Load deck…
            </button>
            <button
              onClick={() => setCommanderOpen(true)}
              className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:border-emerald-600"
            >
              <Crown className="h-4 w-4" strokeWidth={1.75} />
              {commanderLabel
                ? `${commandCards.length > 1 ? "Commanders" : "Commander"}: ${commanderLabel}`
                : "Choose commander…"}
            </button>
            <button
              onClick={onLeave}
              title="Leave this table — your seat and loaded deck go with you"
              className="rounded-md border border-red-900/60 bg-zinc-900 px-4 py-2 text-sm text-red-300/80 hover:border-red-500 hover:text-red-200"
            >
              Leave table
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {FORMATS.map((option) => (
              <button
                key={option.value}
                onClick={() => setFormat(option.value)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  format === option.value
                    ? "border-emerald-600 bg-emerald-950/50 text-emerald-200"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                {option.label}
                <span className="ml-2 text-xs text-zinc-500">{option.detail}</span>
              </button>
            ))}
            <span
              className={`text-xs ${
                deckless.length > 0 ? "text-amber-300/80" : "text-emerald-300/80"
              }`}
              title="Any seated player can start — the button isn't host-only"
            >
              {decked.length}/{view.players.length} decks loaded · anyone can start
            </span>
            {confirmStart && deckless.length > 0 ? (
              <span className="ml-auto flex items-center gap-2 text-xs text-amber-300">
                {deckless.map((p) => p.name).join(", ")}{" "}
                {deckless.length === 1 ? "has" : "have"} no deck — start anyway?
                <button
                  onClick={start}
                  className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
                >
                  Start anyway
                </button>
                <button
                  onClick={() => setConfirmStart(false)}
                  className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={start}
                className="ml-auto rounded-md bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-600"
              >
                Start {format === "commander" ? "Commander " : ""}game
              </button>
            )}
          </div>
          {format === "commander" && commandCards.length === 0 && (
            <p className="mt-2 text-xs text-amber-300/80">
              Tip: pick your commander before starting - it sits in your command
              zone where everyone can see it.
            </p>
          )}
        </section>

        <aside className="flex h-80 flex-col rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Table talk
          </h2>
          <ChatLog
            messages={view.chat}
            players={view.players}
            className="flex-1 overflow-y-auto pr-1"
          />
          <div className="mt-3">
            <ChatInput onSend={(text) => send({ type: "SEND_CHAT", text })} />
          </div>
        </aside>
      </div>

      {deckOpen && (
        <DeckLoader
          started={view.started}
          onLoad={(library, sideboard, commanders) => {
            send({ type: "LOAD_DECK", library, sideboard });
            // a decklist export with a Commander section pre-picks them
            // (the engine pulls each pick out of the 99)
            if (commanders.length > 0) {
              send({ type: "SET_COMMANDER", cards: commanders });
            }
          }}
          onClose={() => setDeckOpen(false)}
        />
      )}

      {commanderOpen && (
        <CommanderPicker
          current={commandCards.flatMap((card) =>
            card.cardId
              ? [
                  {
                    cardId: card.cardId,
                    name:
                      commanderName(get, card.cardId, card.annotations[0]) ??
                      "Commander",
                  },
                ]
              : []
          )}
          deckCandidates={deckCandidates}
          send={send}
          getDef={get}
          onClose={() => setCommanderOpen(false)}
        />
      )}
    </div>
  );
}
