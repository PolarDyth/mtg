"use client";

import { useEffect, useState } from "react";
import { SkipForward } from "lucide-react";
import { ALL_PHASES, type Phase } from "@mythic/shared";

/** Compact strip labels; tooltips spell out the less obvious ones. */
const PHASE_LABELS: Record<Phase, string> = {
  untap: "Untap",
  upkeep: "Upkeep",
  draw: "Draw",
  main1: "Main 1",
  startCombat: "Combat",
  attackers: "Attack",
  blockers: "Block",
  damage: "Damage",
  endCombat: "End Combat",
  main2: "Main 2",
  end: "End",
};

/** mm:ss under an hour, h:mm:ss above. */
function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Turn-phase strip, docked above your hand. The phase is a shared label
 * everyone can move: clicking jumps there for the whole table, "Next ▸"
 * advances one phase, and "Turn" passes the turn outright (NEXT_TURN, same
 * as Ctrl+Shift+Enter). Nothing is enforced anywhere; this is a shared
 * bookmark. The turn counter and elapsed clock tick client-side against the
 * shared start stamp — the server never ticks.
 */
export default function PhaseBar({
  phase,
  turn,
  startedAt,
  activeName,
  isYou,
  onSelect,
  onNext,
  onPassTurn,
}: {
  phase: Phase;
  turn: number;
  /** epoch-ms game start; the clock pauses (renders 00:00) when absent */
  startedAt: number | null;
  activeName: string;
  isYou: boolean;
  onSelect: (phase: Phase) => void;
  onNext: () => void;
  onPassTurn: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  return (
    <div className="bar-in flex h-7 shrink-0 items-center gap-1 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/70 px-2 text-xs">
      <span
        className="mr-1 flex shrink-0 items-center gap-1.5 rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
        title={`Turn ${turn} — time since the game started`}
      >
        <span className="text-zinc-200">Turn {turn}</span>
        <span>{startedAt === null ? "00:00" : formatElapsed(now - startedAt)}</span>
      </span>
      <span
        className={`mr-1 shrink-0 truncate font-medium uppercase tracking-wider ${
          isYou ? "text-emerald-400" : "text-zinc-500"
        }`}
      >
        {activeName}
        {isYou ? " (you)" : ""}
      </span>
      {ALL_PHASES.map((p) => (
        <button
          key={p}
          onClick={() => onSelect(p)}
          title={`Jump to ${PHASE_LABELS[p]}`}
          className={`shrink-0 rounded px-1.5 py-0.5 transition-colors ${
            p === phase
              ? "bg-emerald-800 font-medium text-emerald-100"
              : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          }`}
        >
          {PHASE_LABELS[p]}
        </button>
      ))}
      <button
        onClick={onNext}
        className="ml-auto shrink-0 rounded bg-emerald-700 px-2 py-0.5 font-medium text-white hover:bg-emerald-600"
      >
        Next ▸
      </button>
      <button
        onClick={onPassTurn}
        title="Pass the turn (Ctrl+Shift+Enter)"
        className="flex shrink-0 items-center gap-1 rounded bg-emerald-700 px-2 py-0.5 font-medium text-white hover:bg-emerald-600"
      >
        <SkipForward className="h-3 w-3" strokeWidth={1.75} />
        Turn
      </button>
    </div>
  );
}
