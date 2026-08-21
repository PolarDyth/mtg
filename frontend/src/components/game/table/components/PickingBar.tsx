"use client";

/**
 * Hint bar while picking an arrow target or an attach host — twin markup,
 * differing only in text.
 */

export function PickingBar({
  title,
  text,
  onCancel,
}: {
  title: string;
  text: string;
  onCancel: () => void;
}) {
  return (
    <div className="bar-in flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 text-xs">
      <span className="font-medium text-emerald-300">{title}</span>
      <span className="text-zinc-500">{text}</span>
      <button
        onClick={onCancel}
        className="ml-auto rounded border border-zinc-700 px-2 py-0.5 text-zinc-400 transition-colors hover:border-emerald-600 hover:text-zinc-200"
      >
        Cancel (Esc)
      </button>
    </div>
  );
}
