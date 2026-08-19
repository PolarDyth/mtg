"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { Action, GameView, PlayerId } from "@mythic/shared";
import { useGame } from "@/lib/useGame";
import { clearSession, loadName, loadSession } from "@/lib/session";
import { ChatInput, ChatLog } from "./ChatLog";
import Lobby from "./Lobby";

export default function GameClient({ code }: { code: string }) {
  const { view, you, status, fatal, toast, clearToast, send } = useGame(code);

  // Visiting /game/[code] cold with no identity at all → back to the home page.
  useEffect(() => {
    if (!loadName() && !loadSession(code)) {
      window.location.replace("/");
    }
  }, [code]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(clearToast, 3000);
    return () => clearTimeout(timer);
  }, [toast, clearToast]);

  if (fatal) {
    clearSession(code);
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm rounded-xl border border-red-900 bg-zinc-900 p-6 text-center">
          <h1 className="text-lg font-semibold text-red-300">Can&apos;t sit down</h1>
          <p className="mt-2 text-sm text-zinc-400">{fatal}</p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium hover:bg-zinc-700"
          >
            Back home
          </Link>
        </div>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="animate-pulse text-zinc-400">
          {status === "reconnecting"
            ? "Reconnecting…"
            : `Connecting to ${code}…`}
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col p-4">
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-amber-800 bg-amber-950/90 px-4 py-2 text-sm text-amber-200 shadow-lg">
          {toast}
        </div>
      )}

      {view.started ? (
        <GameStartedStub view={view} you={you} send={send} />
      ) : (
        <Lobby view={view} you={you} send={send} />
      )}
    </main>
  );
}

/**
 * M2 interim screen: proves the full snapshot pipeline in-browser while the
 * real table UI (drag & drop, battlefield, hand fan) lands in M5.
 */
function GameStartedStub({
  view,
  you,
  send,
}: {
  view: GameView;
  you: PlayerId | null;
  send: (action: Action) => void;
}) {
  const self = view.players.find((p) => p.id === you);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg text-zinc-300">{view.code}</h1>
        <span className="text-xs text-zinc-500">
          The full table UI is under construction — snapshot pipeline live.
        </span>
      </div>

      <div className="grid flex-1 grid-cols-[1fr_280px] gap-4">
        <section className="space-y-3">
          {view.players.map((player) => (
            <div
              key={player.id}
              className={`rounded-lg border p-4 ${
                player.id === view.activePlayerId
                  ? "border-emerald-700 bg-emerald-950/30"
                  : "border-zinc-800 bg-zinc-900/60"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    player.connected ? "bg-emerald-500" : "bg-zinc-600"
                  }`}
                />
                <span className="font-medium text-zinc-100">
                  {player.name}
                  {player.id === you && " (you)"}
                </span>
                <span className="ml-auto font-mono text-2xl text-red-300">
                  {player.life}
                </span>
              </div>
              <div className="mt-2 flex gap-4 text-xs text-zinc-500">
                <span>✋ {countOf(player.zones.hand)}</span>
                <span>📚 {countOf(player.zones.library)}</span>
                <span>⚔️ {countOf(player.zones.battlefield)}</span>
                <span>🪦 {countOf(player.zones.graveyard)}</span>
              </div>
              {player.id === you && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => send({ type: "DRAW_CARDS", count: 1 })}
                    className="rounded bg-zinc-800 px-3 py-1.5 text-xs hover:bg-zinc-700"
                  >
                    Draw 1
                  </button>
                  <button
                    onClick={() => send({ type: "SET_LIFE", life: self!.life - 1 })}
                    className="rounded bg-zinc-800 px-3 py-1.5 text-xs hover:bg-zinc-700"
                  >
                    −1 life
                  </button>
                  <button
                    onClick={() => send({ type: "SET_LIFE", life: self!.life + 1 })}
                    className="rounded bg-zinc-800 px-3 py-1.5 text-xs hover:bg-zinc-700"
                  >
                    +1 life
                  </button>
                  <button
                    onClick={() => send({ type: "ROLL_DIE", sides: 20 })}
                    className="rounded bg-zinc-800 px-3 py-1.5 text-xs hover:bg-zinc-700"
                  >
                    🎲 d20
                  </button>
                  <button
                    onClick={() => send({ type: "NEXT_TURN" })}
                    className="rounded bg-emerald-800 px-3 py-1.5 text-xs hover:bg-emerald-700"
                  >
                    Next turn
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>

        <aside className="flex flex-col rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <ChatLog messages={view.chat} players={view.players} className="flex-1 overflow-y-auto" />
          <div className="mt-3">
            <ChatInput onSend={(text) => send({ type: "SEND_CHAT", text })} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function countOf(zone: { kind: "cards"; cards: unknown[] } | { kind: "count"; count: number }): number {
  return zone.kind === "cards" ? zone.cards.length : zone.count;
}
