"use client";

import { useState } from "react";
import type { Action, GameView, PlayerId } from "@mythic/shared";
import { ChatInput, ChatLog, nameColor } from "./ChatLog";
import DeckLoader from "./DeckLoader";

export default function Lobby({
  view,
  you,
  send,
}: {
  view: GameView;
  you: PlayerId | null;
  send: (action: Action) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);

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
          Share this code with your friends — {view.players.length} seated
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
            {view.players.map((player) => (
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
                <span
                  className="font-medium"
                  style={{ color: nameColor(player.id) }}
                >
                  {player.name}
                </span>
                {player.id === you && (
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                    you
                  </span>
                )}
                <span className="ml-auto text-xs text-zinc-500">
                  {player.hasDeck ? "🂠 deck loaded" : "no deck yet"}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setDeckOpen(true)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:border-emerald-600"
            >
              Load deck…
            </button>
            <button
              onClick={() => send({ type: "START_GAME" })}
              className="rounded-md bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            >
              Start game
            </button>
            <span className="text-xs text-zinc-600">
              You can start with any number of players; friends can still join mid-game.
            </span>
          </div>
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
          onLoad={(library, sideboard) =>
            send({ type: "LOAD_DECK", library, sideboard })
          }
          onClose={() => setDeckOpen(false)}
        />
      )}
    </div>
  );
}
