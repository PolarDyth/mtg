"use client";

/**
 * Toolbar over the hand while selecting: group actions for the checked
 * cards (discard / exile / reveal / reveal to… / bottom).
 */

export function SelectionBar({
  count,
  onDiscard,
  onExile,
  onReveal,
  onRevealTo,
  onBottom,
}: {
  count: number;
  onDiscard: () => void;
  onExile: () => void;
  onReveal: () => void;
  onRevealTo: () => void;
  onBottom: () => void;
}) {
  return (
    <div className="bar-in flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 text-xs">
      <span className="text-zinc-500">{count} selected</span>
      <div className="ml-auto flex items-center gap-1.5">
        <GroupButton label="Discard" disabled={!count} onClick={onDiscard} />
        <GroupButton label="Exile" disabled={!count} onClick={onExile} />
        <GroupButton label="Reveal" disabled={!count} onClick={onReveal} />
        <GroupButton label="Reveal to…" disabled={!count} onClick={onRevealTo} />
        <GroupButton label="To bottom" disabled={!count} onClick={onBottom} />
      </div>
    </div>
  );
}

function GroupButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 transition-colors hover:border-emerald-600 hover:text-white disabled:opacity-40 disabled:hover:border-zinc-700"
    >
      {label}
    </button>
  );
}
