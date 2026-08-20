"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Action, CardView } from "@mythic/shared";

/** Common counter kinds, one tap each. */
const PRESETS = ["+1/+1", "-1/-1", "Lore", "Shield", "Stun"];
/** Engine-side bounds (server clamps to the same range). */
const MAX_VALUE = 999;
const MAX_KINDS = 12;

function stripZeros(counters: Record<string, number>): Record<string, number> {
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(counters)) if (v > 0) clean[k] = v;
  return clean;
}

function sameCounters(
  a: Record<string, number> | null,
  b: Record<string, number>
): boolean {
  if (!a) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

/** Stepper that steps once per tap and repeats while held down. */
function StepButton({ label, onStep }: { label: string; onStep: () => void }) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stop() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  }

  useEffect(() => stop, []);

  return (
    <button
      className="rounded bg-zinc-800 px-1.5 hover:bg-zinc-700"
      onPointerDown={(e) => {
        e.preventDefault();
        onStep();
        stop();
        timeoutRef.current = setTimeout(() => {
          intervalRef.current = setInterval(onStep, 120);
        }, 400);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      {label}
    </button>
  );
}

/**
 * Persistent counter editor anchored near a card. Unlike the old in-menu
 * editor it receives the LIVE card (GameTable re-derives it from every
 * snapshot), keeps an optimistic local draft, and reconciles when the
 * server confirms our commits — so rapid +/- taps accumulate correctly and
 * the shown numbers always track reality. Stays open until dismissed.
 */
export default function CounterPopover({
  card,
  name,
  x,
  y,
  send,
  onClose,
}: {
  card: CardView;
  name: string;
  x: number;
  y: number;
  send: (action: Action) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Record<string, number>>(() =>
    stripZeros(card.counters)
  );
  const [newKind, setNewKind] = useState("");
  // last committed record + whether the server has echoed it back (state,
  // not a ref — the reconciliation below runs during render)
  const [lastSent, setLastSent] = useState<{
    counters: Record<string, number>;
    acked: boolean;
  } | null>(null);
  const [seenLive, setSeenLive] = useState(card.counters);

  // Reconcile on new snapshots (render-time reset, no effects): our echo
  // confirms the draft; an unexpected value while a commit is still in
  // flight is an older snapshot or a concurrent writer — keep the draft;
  // anything else (nobody pending) is an external edit — adopt it.
  if (card.counters !== seenLive) {
    setSeenLive(card.counters);
    const isOurEcho = lastSent !== null && sameCounters(lastSent.counters, card.counters);
    const inFlight = lastSent !== null && !lastSent.acked && !isOurEcho;
    if (isOurEcho && lastSent) setLastSent({ ...lastSent, acked: true });
    if (!inFlight) setDraft(stripZeros(card.counters));
  }

  function commit(next: Record<string, number>) {
    const clean = stripZeros(next);
    setDraft(clean);
    setLastSent({ counters: clean, acked: false });
    send({ type: "SET_COUNTERS", uid: card.uid, counters: clean });
  }

  function bump(kind: string, delta: number) {
    const value = Math.min(MAX_VALUE, Math.max(0, (draft[kind] ?? 0) + delta));
    const next = { ...draft, [kind]: value };
    if (value === 0) delete next[kind];
    commit(next);
  }

  function setKindValue(kind: string, value: number) {
    const clamped = Math.min(MAX_VALUE, Math.max(0, value));
    const next = { ...draft, [kind]: clamped };
    if (clamped === 0) delete next[kind];
    commit(next);
  }

  function removeKind(kind: string) {
    const next = { ...draft };
    delete next[kind];
    commit(next);
  }

  function addKind(kind: string) {
    // engine caps distinct kinds; ignore extras instead of erroring
    if (!(kind in draft) && Object.keys(draft).length >= MAX_KINDS) return;
    bump(kind, 1);
  }

  // click-away / window blur closes (the popover itself stops propagation)
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  // keep fully on screen, re-measuring when rows are added/removed
  const width = 256;
  const baseLeft = Math.min(x, window.innerWidth - width - 8);
  const baseTop = Math.min(y, window.innerHeight - 120);
  const kindCount = Object.keys(draft).length;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.left = `${baseLeft}px`;
    el.style.top = `${baseTop}px`;
    const rect = el.getBoundingClientRect();
    const overflowY = rect.bottom - (window.innerHeight - 8);
    if (overflowY > 0) el.style.top = `${Math.max(8, baseTop - overflowY)}px`;
    const overflowX = rect.right - (window.innerWidth - 8);
    if (overflowX > 0) el.style.left = `${Math.max(8, baseLeft - overflowX)}px`;
  }, [baseLeft, baseTop, kindCount]);

  return (
    <div
      ref={ref}
      style={{ left: baseLeft, top: baseTop }}
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed z-50 w-64 rounded-md border border-zinc-700 bg-zinc-900 p-2 text-sm shadow-2xl"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="truncate text-xs font-medium text-zinc-400">{name}</span>
        <button
          onClick={onClose}
          aria-label="Close counters"
          className="ml-auto rounded px-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {PRESETS.map((kind) => (
          <button
            key={kind}
            onClick={() => addKind(kind)}
            className={`rounded-full px-2 py-0.5 text-[11px] transition-colors ${
              draft[kind]
                ? "border border-emerald-600 bg-emerald-950/50 text-emerald-200"
                : "border border-zinc-700 text-zinc-400 hover:border-emerald-600 hover:text-emerald-200"
            }`}
          >
            {kind}
          </button>
        ))}
      </div>

      <div className="mt-1.5 rounded border border-zinc-700 bg-zinc-950 p-1.5">
        {Object.entries(draft).map(([kind, value]) => (
          <div key={kind} className="flex items-center gap-1 py-0.5 text-xs">
            <span className="min-w-0 flex-1 truncate text-zinc-300" title={kind}>
              {kind}
            </span>
            <button
              className="rounded px-1 text-zinc-500 hover:bg-zinc-800 hover:text-red-300"
              title={`remove ${kind}`}
              onClick={() => removeKind(kind)}
            >
              ×
            </button>
            <StepButton label="−" onStep={() => bump(kind, -1)} />
            <input
              key={`${kind}:${value}`}
              type="text"
              inputMode="numeric"
              defaultValue={String(value)}
              onBlur={(e) => {
                const parsed = parseInt(e.currentTarget.value, 10);
                if (!Number.isFinite(parsed)) {
                  e.currentTarget.value = String(draft[kind] ?? 0);
                  return;
                }
                setKindValue(kind, parsed);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              title="set an exact value"
              className="w-9 rounded bg-zinc-900 px-1 text-center font-mono text-zinc-200 outline-none ring-1 ring-zinc-700 focus:ring-emerald-600"
            />
            <StepButton label="+" onStep={() => bump(kind, 1)} />
          </div>
        ))}
        {kindCount === 0 && (
          <p className="py-0.5 text-xs text-zinc-600">no counters</p>
        )}
        <form
          className="mt-1 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const kind = newKind.trim().slice(0, 20);
            if (kind) addKind(kind);
            setNewKind("");
          }}
        >
          <input
            value={newKind}
            onChange={(e) => setNewKind(e.target.value)}
            placeholder="custom kind…"
            className="min-w-0 flex-1 rounded bg-zinc-900 px-1.5 py-0.5 text-xs outline-none ring-1 ring-zinc-700 focus:ring-emerald-600"
          />
          <button
            type="submit"
            className="rounded bg-zinc-800 px-1.5 text-xs hover:bg-zinc-700"
          >
            add
          </button>
        </form>
      </div>
    </div>
  );
}
