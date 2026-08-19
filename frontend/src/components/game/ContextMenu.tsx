"use client";

import { useEffect, useRef, useState } from "react";
import type { Action, CardView } from "@mythic/shared";

export type MenuState =
  | { kind: "card"; card: CardView; onBattlefield: boolean; x: number; y: number }
  | { kind: "library"; x: number; y: number }
  | null;

/** Right-click menu for cards (and the library pile). */
export default function ContextMenu({
  menu,
  send,
  onClose,
  onNote,
}: {
  menu: MenuState;
  send: (action: Action) => void;
  onClose: () => void;
  onNote: (card: CardView) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [countersOpen, setCountersOpen] = useState(false);

  // reset the submenu whenever a new menu opens (render-time reset pattern)
  const [prevMenu, setPrevMenu] = useState(menu);
  if (menu !== prevMenu) {
    setPrevMenu(menu);
    setCountersOpen(false);
  }

  useEffect(() => {
    if (!menu) return;
    const close = () => onClose();
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const style = {
    left: Math.min(menu.x, window.innerWidth - 230),
    top: Math.min(menu.y, window.innerHeight - 320),
  };

  if (menu.kind === "library") {
    return (
      <div
        ref={ref}
        style={style}
        onPointerDown={(e) => e.stopPropagation()}
        className="fixed z-50 w-44 rounded-md border border-zinc-700 bg-zinc-900 py-1 text-sm shadow-2xl"
      >
        <MenuItem label="Draw 1" onClick={() => { send({ type: "DRAW_CARDS", count: 1 }); onClose(); }} />
        <MenuItem label="Draw 7" onClick={() => { send({ type: "DRAW_CARDS", count: 7 }); onClose(); }} />
        <MenuItem label="Shuffle" onClick={() => { send({ type: "SHUFFLE_LIBRARY" }); onClose(); }} />
      </div>
    );
  }

  const { card, onBattlefield } = menu;

  return (
    <div
      ref={ref}
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed z-50 w-44 rounded-md border border-zinc-700 bg-zinc-900 py-1 text-sm shadow-2xl"
    >
      {onBattlefield && (
        <>
          <MenuItem
            label={card.tapped ? "Untap" : "Tap"}
            onClick={() => { send({ type: "SET_TAPPED", uid: card.uid, value: !card.tapped }); onClose(); }}
          />
          <MenuItem
            label={card.faceDown ? "Turn face up" : "Turn face down"}
            onClick={() => { send({ type: "SET_FACE_DOWN", uid: card.uid, value: !card.faceDown }); onClose(); }}
          />
          <MenuDivider />
        </>
      )}

      <button
        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
        onClick={() => setCountersOpen((v) => !v)}
      >
        Counters… <span className="text-zinc-500">{countersOpen ? "▾" : "▸"}</span>
      </button>
      {countersOpen && (
        <CounterEditor card={card} send={send} />
      )}

      <MenuItem label="Add note…" onClick={() => { onNote(card); onClose(); }} />
      {onBattlefield && card.attachedTo && (
        <MenuItem
          label="Detach"
          onClick={() => { send({ type: "ATTACH_CARD", uid: card.uid, to: null }); onClose(); }}
        />
      )}
      <MenuDivider />
      <MenuItem
        label="Reveal to table"
        onClick={() => {
          send({
            type: "REVEAL_CARDS",
            cards: [{ uid: card.uid, name: card.annotations[0] ?? "Card" }],
          });
          onClose();
        }}
      />
    </div>
  );
}

function CounterEditor({ card, send }: { card: CardView; send: (action: Action) => void }) {
  const [kinds, setKinds] = useState<string[]>(Object.keys(card.counters));
  const [newKind, setNewKind] = useState("");

  function commit(next: Record<string, number>) {
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(next)) if (v > 0) clean[k] = v;
    send({ type: "SET_COUNTERS", uid: card.uid, counters: clean });
  }

  function bump(kind: string, delta: number) {
    const next = { ...card.counters, [kind]: Math.max(0, (card.counters[kind] ?? 0) + delta) };
    if (next[kind] === 0) delete next[kind];
    commit(next);
    if (delta > 0 && !kinds.includes(kind)) setKinds([...kinds, kind]);
  }

  return (
    <div className="mx-2 mb-1 rounded border border-zinc-700 bg-zinc-950 p-1.5">
      {kinds.map((kind) => (
        <div key={kind} className="flex items-center gap-1 py-0.5 text-xs">
          <span className="min-w-0 flex-1 truncate text-zinc-300">{kind}</span>
          <button className="rounded bg-zinc-800 px-1.5 hover:bg-zinc-700" onClick={() => bump(kind, -1)}>−</button>
          <span className="w-5 text-center font-mono text-zinc-200">{card.counters[kind] ?? 0}</span>
          <button className="rounded bg-zinc-800 px-1.5 hover:bg-zinc-700" onClick={() => bump(kind, 1)}>+</button>
        </div>
      ))}
      {kinds.length === 0 && <p className="py-0.5 text-xs text-zinc-600">no counters</p>}
      <form
        className="mt-1 flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          const kind = newKind.trim().slice(0, 20);
          if (kind) bump(kind, 1);
          setNewKind("");
        }}
      >
        <input
          value={newKind}
          onChange={(e) => setNewKind(e.target.value)}
          placeholder="+1/+1…"
          className="min-w-0 flex-1 rounded bg-zinc-900 px-1.5 py-0.5 text-xs outline-none ring-1 ring-zinc-700 focus:ring-emerald-600"
        />
        <button type="submit" className="rounded bg-zinc-800 px-1.5 text-xs hover:bg-zinc-700">add</button>
      </form>
    </div>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
    >
      {label}
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 h-px bg-zinc-800" />;
}
