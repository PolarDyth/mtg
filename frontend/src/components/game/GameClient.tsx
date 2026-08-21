"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useGame } from "@/lib/useGame";
import { clearSession, loadName, loadSession } from "@/lib/session";
import DeckLoader from "./DeckLoader";
import GameTable from "./GameTable";
import Lobby from "./Lobby";

export default function GameClient({ code }: { code: string }) {
  const { view, you, status, fatal, toast, clearToast, send } = useGame(code);
  const [deckOpen, setDeckOpen] = useState(false);

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

  /** The one true way out besides closing the tab: LEAVE_GAME removes the
   *  seat (cards go with you, host transfers), then we drop the session and
   *  go home — unmounting closes the socket. */
  function leaveTable(started: boolean) {
    const message = started
      ? "Leave this game? Your cards leave with you and the host role transfers if you're the host."
      : "Leave this table? Your seat and loaded deck leave with you.";
    if (!window.confirm(message)) return;
    send({ type: "LEAVE_GAME" });
    clearSession(code);
    window.location.replace("/");
  }

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
    <main className="flex min-h-screen flex-col">
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-amber-800 bg-amber-950/90 px-4 py-2 text-sm text-amber-200 shadow-lg">
          {toast}
        </div>
      )}

      {view.started ? (
        <GameTable
          view={view}
          you={you}
          send={send}
          onOpenDeck={() => setDeckOpen(true)}
          onLeave={() => leaveTable(true)}
        />
      ) : (
        <Lobby view={view} you={you} send={send} onLeave={() => leaveTable(false)} />
      )}

      {deckOpen && (
        <DeckLoader
          started={view.started}
          onLoad={(library, sideboard) =>
            send({ type: "LOAD_DECK", library, sideboard })
          }
          onClose={() => setDeckOpen(false)}
        />
      )}
    </main>
  );
}
