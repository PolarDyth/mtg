"use client";

import { useState } from "react";

/** Count-picking flows; scry/surveil hand off to the ScryModal afterwards. */
export type PickerMode =
  | "draw"
  | "mill"
  | "mulligan"
  | "token"
  | "clone"
  | "scry"
  | "surveil"
  | "lookTop"
  | "revealTop"
  | "discardRandom"
  | "putFromTop";

type PickerConfig = {
  title: string;
  blurb: string;
  confirm: (n: number, subject?: string) => string;
  /** Shown instead of the stepper when there's nothing to act on. */
  empty?: string;
};

const CONFIG: Record<PickerMode, PickerConfig> = {
  draw: {
    title: "Draw cards",
    blurb: "Move cards from the top of your library to your hand.",
    confirm: (n) => `Draw ${n}`,
  },
  mill: {
    title: "Mill cards",
    blurb: "Put the top cards of your library into your graveyard.",
    confirm: (n) => `Mill ${n}`,
  },
  mulligan: {
    title: "Mulligan",
    blurb: "Shuffle your hand into your library, then draw a fresh hand of this size.",
    confirm: (n) => `Mulligan to ${n}`,
  },
  token: {
    title: "Create tokens",
    blurb: "Mint this many copies of the token onto your battlefield.",
    confirm: (n, subject) => `Create ${n} × ${subject ?? "token"}`,
  },
  clone: {
    title: "Clone card",
    blurb: "Spawn that many copies of this card onto the battlefield.",
    confirm: (n) => `Clone × ${n}`,
  },
  scry: {
    title: "Scry",
    blurb: "Look at the top cards, then put any number on the bottom and the rest on top.",
    confirm: (n) => `Look at ${n}`,
  },
  surveil: {
    title: "Surveil",
    blurb: "Look at the top cards, then put any number into your graveyard and the rest on top.",
    confirm: (n) => `Look at ${n}`,
  },
  lookTop: {
    title: "Look at top of library",
    blurb: "Peek at the top of your library — only you see the order.",
    confirm: (n) => `Look at top ${n}`,
  },
  revealTop: {
    title: "Reveal top of library",
    blurb: "Show the top cards of your library to the whole table.",
    confirm: (n) => `Reveal top ${n}`,
  },
  discardRandom: {
    title: "Discard at random",
    blurb: "The server rolls the dice and puts this many random cards from your hand into your graveyard.",
    confirm: (n) => `Discard ${n} at random`,
    empty: "your hand is empty",
  },
  putFromTop: {
    title: "Put into library",
    blurb: "Put the card this many cards from the top of your library (1 = on top).",
    confirm: (n) => `Put ${n} from top`,
  },
};

/** Small "how many?" modal with a stepper, shared by the N-actions. */
export default function CountPickerModal({
  mode,
  max,
  initial = 1,
  subject,
  onConfirm,
  onClose,
}: {
  mode: PickerMode;
  max: number;
  /** starting value (e.g. the current hand size for a mulligan) */
  initial?: number;
  /** what the count applies to (e.g. the token's name for token creation) */
  subject?: string;
  onConfirm: (n: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const config = CONFIG[mode];
  const clamped = Math.min(Math.max(1, value), Math.max(1, max));

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="overlay-in w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold text-zinc-100">
          {config.title}
          {subject && <span className="ml-2 font-normal text-zinc-400">{subject}</span>}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">{config.blurb}</p>

        {max < 1 ? (
          <p className="mt-6 mb-2 text-center text-sm text-zinc-500">
            {config.empty ?? "your library is empty"}
          </p>
        ) : (
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setValue(Math.max(1, clamped - 1))}
              className="h-9 w-9 rounded-md border border-zinc-700 text-lg text-zinc-300 hover:border-emerald-600"
              aria-label="one fewer"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              max={max}
              value={clamped}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setValue(n);
              }}
              className="w-20 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-center font-mono text-lg text-zinc-100 outline-none focus:border-emerald-600"
            />
            <button
              type="button"
              onClick={() => setValue(Math.min(max, clamped + 1))}
              className="h-9 w-9 rounded-md border border-zinc-700 text-lg text-zinc-300 hover:border-emerald-600"
              aria-label="one more"
            >
              +
            </button>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(clamped)}
            disabled={max < 1}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
          >
            {config.confirm(clamped, subject)}
          </button>
        </div>
      </div>
    </div>
  );
}
