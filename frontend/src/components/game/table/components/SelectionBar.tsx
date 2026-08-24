"use client";

/**
 * Toolbar over the hand or battlefield while selecting: group actions for
 * the checked cards, fed as data so both surfaces share one bar.
 */

export function SelectionBar({
  count,
  actions,
}: {
  count: number;
  actions: { label: string; run: () => void }[];
}) {
  return (
    <div className="bar-in flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 text-xs">
      <span className="text-zinc-500">{count} selected</span>
      <div className="ml-auto flex items-center gap-1.5">
        {actions.map((action) => (
          <GroupButton
            key={action.label}
            label={action.label}
            disabled={!count}
            onClick={action.run}
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
