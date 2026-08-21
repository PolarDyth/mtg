"use client";

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

/**
 * Turn-phase strip, docked above your hand. The phase is a shared label
 * everyone can move: clicking jumps there for the whole table, "Next ▸"
 * advances one phase (GameTable decides what "after end" means — passing
 * the turn). Nothing is enforced anywhere; this is a shared bookmark.
 */
export default function PhaseBar({
  phase,
  activeName,
  isYou,
  onSelect,
  onNext,
}: {
  phase: Phase;
  activeName: string;
  isYou: boolean;
  onSelect: (phase: Phase) => void;
  onNext: () => void;
}) {
  return (
    <div className="bar-in flex h-7 shrink-0 items-center gap-1 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/70 px-2 text-xs">
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
    </div>
  );
}
