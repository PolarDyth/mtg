"use client";

/**
 * A player's public mana pool as W/U/B/R/G/C pips in their band header.
 * Opponents' bars are read-only and hidden while empty. Your own pips are
 * directly editable — left-click +1, right-click or Shift-click −1 — with a
 * clear button beside them whenever anything is banked. One gesture each
 * way; no popover.
 */

import type { MouseEvent as ReactMouseEvent } from "react";
import { X } from "lucide-react";
import { MANA_COLORS, type ManaColor, type ManaPool } from "@cardessa/shared";

const PIP_COLORS: Record<ManaColor, string> = {
  W: "text-zinc-100",
  U: "text-sky-400",
  B: "text-violet-400",
  R: "text-red-400",
  G: "text-emerald-400",
  C: "text-zinc-400",
};

export function ManaBar({
  mana,
  editable = false,
  onAdd,
  onSpend,
  onClear,
}: {
  mana: ManaPool;
  /** your own band only — pips become buttons */
  editable?: boolean;
  onAdd?: (color: ManaColor) => void;
  onSpend?: (color: ManaColor) => void;
  onClear?: () => void;
}) {
  const total = MANA_COLORS.reduce((sum, color) => sum + mana[color], 0);
  if (!editable && total === 0) return null;

  const spend = (color: ManaColor, event: ReactMouseEvent) => {
    event.preventDefault(); // keep the browser context menu out of the way
    onSpend?.(color);
  };

  return (
    <span className="flex shrink-0 items-center gap-0.5" data-mana-bar>
      {MANA_COLORS.map((color) => {
        const count = mana[color];
        if (!editable && count === 0) return null;
        const glyph = (
          <>
            <span className={PIP_COLORS[color]}>{color}</span>
            <span className="text-zinc-400">{count}</span>
          </>
        );
        return editable ? (
          <button
            key={color}
            title={`${color}: ${count} — click +1, right-click / Shift-click −1`}
            onClick={(event) =>
              event.shiftKey ? onSpend?.(color) : onAdd?.(color)
            }
            onContextMenu={(event) => spend(color, event)}
            className="flex items-center gap-0.5 rounded border border-zinc-700/70 bg-zinc-900/80 px-1 font-mono text-[10px] leading-4 transition-colors hover:border-emerald-600"
          >
            {glyph}
          </button>
        ) : (
          <span
            key={color}
            title={`${color}: ${count}`}
            className="flex items-center gap-0.5 px-0.5 font-mono text-[10px] leading-4"
          >
            {glyph}
          </span>
        );
      })}
      {editable && total > 0 && (
        <button
          title="Clear mana pool (Alt+C)"
          onClick={onClear}
          className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-300"
        >
          <X className="h-3 w-3" strokeWidth={1.75} />
        </button>
      )}
    </span>
  );
}
