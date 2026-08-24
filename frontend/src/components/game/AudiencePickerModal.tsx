"use client";

import { useState } from "react";
import type { PlayerId, PlayerView } from "@cardessa/shared";
import { Check, Users } from "lucide-react";
import { nameColor } from "./ChatLog";

/**
 * Picks who a reveal is for: everyone at the table (the default) or any set
 * of specific players. Confirming with nobody selected reveals to everyone.
 */
export default function AudiencePickerModal({
  players,
  onCancel,
  onConfirm,
}: {
  /** the other seated players */
  players: PlayerView[];
  onCancel: () => void;
  /** null = reveal to the whole table */
  onConfirm: (to: PlayerId[] | null) => void;
}) {
  const [targets, setTargets] = useState<Set<PlayerId>>(() => new Set());

  // snapshots can drop players between open and confirm — never act on stale ids
  const selected = [...targets].filter((id) => players.some((p) => p.id === id));

  function toggle(id: PlayerId) {
    setTargets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <div
        className="overlay-in flex w-full max-w-sm flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-zinc-800 px-5 py-3">
          <h2 className="font-semibold text-zinc-100">Reveal to…</h2>
        </header>

        <div className="space-y-1.5 p-4">
          <button
            onClick={() => setTargets(new Set())}
            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
              selected.length === 0
                ? "border-emerald-600 bg-emerald-800/40 text-emerald-200"
                : "border-zinc-800 bg-zinc-950/70 text-zinc-300 hover:border-zinc-700"
            }`}
          >
            <Users className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            Everyone at the table
            {selected.length === 0 && (
              <Check className="ml-auto h-4 w-4 text-emerald-400" strokeWidth={2} />
            )}
          </button>

          {players.map((player) => {
            const on = selected.includes(player.id);
            return (
              <button
                key={player.id}
                onClick={() => toggle(player.id)}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  on
                    ? "border-emerald-600 bg-emerald-800/40"
                    : "border-zinc-800 bg-zinc-950/70 hover:border-zinc-700"
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: nameColor(player.id) }}
                />
                <span style={{ color: nameColor(player.id) }}>{player.name}</span>
                {!player.connected && (
                  <span className="text-xs text-zinc-600">offline</span>
                )}
                {on && (
                  <Check className="ml-auto h-4 w-4 text-emerald-400" strokeWidth={2} />
                )}
              </button>
            );
          })}

          {players.length === 0 && (
            <p className="pt-1 text-xs text-zinc-600">
              nobody else is seated — the reveal will be just for you
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-3">
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selected.length ? selected : null)}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-emerald-50 hover:bg-emerald-600"
          >
            Reveal
          </button>
        </footer>
      </div>
    </div>
  );
}
