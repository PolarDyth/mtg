"use client";

/**
 * Toolbar over a selection: labeled group actions for the checked cards.
 * Generic on purpose — the hand (discard / exile / reveal / bottom) and the
 * battlefield (tap / counters / zone moves) pass different action sets.
 */

export function SelectionBar({
  count,
  actions,
}: {
  count: number;
  actions: { label: string; onClick: () => void }[];
}) {
  return (
    <div className="bar-in flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 text-xs">
      <span className="text-zinc-500">{count} selected</span>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
        {actions.map((action) => (
          <GroupButton
            key={action.label}
            label={action.label}
            disabled={!count}
            onClick={action.onClick}
          />
        ))}
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
