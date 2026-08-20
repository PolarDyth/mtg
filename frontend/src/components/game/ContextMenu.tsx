"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Action, CardView, Zone } from "@mythic/shared";
import type { PickerMode } from "./CountPickerModal";

export type MenuState =
  | {
      kind: "card";
      card: CardView;
      /** the zone the card currently lives in (drives the game actions) */
      zone: Zone;
      /** display name for reveals, resolved from card defs at open time */
      name: string;
      x: number;
      y: number;
    }
  | { kind: "library"; x: number; y: number }
  | null;

/** One-card game action, labeled the way players talk about it. */
type QuickAction = { label: string; build: (uid: string) => Action };

const move = (uid: string, to: Zone, index?: "top" | "bottom"): Action => ({
  type: "MOVE_CARD",
  uid,
  to,
  ...(index !== undefined ? { index } : {}),
});

/** The most common actions per source zone, shown at the top of the menu. */
const QUICK: Record<Zone, QuickAction[]> = {
  hand: [
    { label: "Discard", build: (uid) => ({ type: "DISCARD_CARDS", uids: [uid] }) },
    { label: "Put onto battlefield", build: (uid) => move(uid, "battlefield") },
  ],
  battlefield: [
    { label: "Return to hand", build: (uid) => move(uid, "hand") },
    { label: "Put into graveyard", build: (uid) => move(uid, "graveyard") },
    { label: "Put into exile", build: (uid) => move(uid, "exile") },
  ],
  graveyard: [
    { label: "Return to hand", build: (uid) => move(uid, "hand") },
    { label: "Put onto battlefield", build: (uid) => move(uid, "battlefield") },
    { label: "Put into exile", build: (uid) => move(uid, "exile") },
  ],
  exile: [
    { label: "Return to hand", build: (uid) => move(uid, "hand") },
    { label: "Put onto battlefield", build: (uid) => move(uid, "battlefield") },
  ],
  command: [
    { label: "Put onto battlefield", build: (uid) => move(uid, "battlefield") },
    { label: "Return to hand", build: (uid) => move(uid, "hand") },
  ],
  library: [
    { label: "Draw this card", build: (uid) => move(uid, "hand") },
    { label: "Put on bottom of library", build: (uid) => move(uid, "library", "bottom") },
  ],
  sideboard: [
    { label: "Put onto battlefield", build: (uid) => move(uid, "battlefield") },
  ],
};

/** Every destination, labeled as a game action. */
const ALL_TARGETS: QuickAction[] = [
  { label: "Return to hand", build: (uid) => move(uid, "hand") },
  { label: "Put onto battlefield", build: (uid) => move(uid, "battlefield") },
  { label: "Put into graveyard", build: (uid) => move(uid, "graveyard") },
  { label: "Put into exile", build: (uid) => move(uid, "exile") },
  { label: "Put into command zone", build: (uid) => move(uid, "command") },
  { label: "Put on top of library", build: (uid) => move(uid, "library", "top") },
  { label: "Put on bottom of library", build: (uid) => move(uid, "library", "bottom") },
  { label: "Move to sideboard", build: (uid) => move(uid, "sideboard") },
];

/** Label of the destination that equals the card's current zone. */
const CURRENT_ZONE: Partial<Record<Zone, string>> = {
  hand: "Return to hand",
  battlefield: "Put onto battlefield",
  graveyard: "Put into graveyard",
  exile: "Put into exile",
  command: "Put into command zone",
  sideboard: "Move to sideboard",
};

/** Remaining destinations: everything not already a quick action or the
 *  zone the card is in. */
function moveTargets(zone: Zone): QuickAction[] {
  const skip = new Set(QUICK[zone].map((q) => q.label));
  const current = CURRENT_ZONE[zone];
  if (current) skip.add(current);
  return ALL_TARGETS.filter((t) => !skip.has(t.label));
}

/** Right-click menu for cards (and the library pile). */
export default function ContextMenu({
  menu,
  send,
  onClose,
  onNote,
  onPicker,
  onViewLibrary,
  onRevealTo,
  onDrawArrowFrom,
}: {
  menu: MenuState;
  send: (action: Action) => void;
  onClose: () => void;
  onNote: (card: CardView) => void;
  onPicker: (mode: PickerMode) => void;
  onViewLibrary: () => void;
  /** opens the reveal audience picker for this card */
  onRevealTo: (card: CardView, name: string) => void;
  /** starts arrow targeting from this card ("Draw arrow to…") */
  onDrawArrowFrom: (card: CardView) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [countersOpen, setCountersOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  // reset the submenus whenever a new menu opens (render-time reset pattern)
  const [prevMenu, setPrevMenu] = useState(menu);
  if (menu !== prevMenu) {
    setPrevMenu(menu);
    setCountersOpen(false);
    setMoveOpen(false);
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

  const width = menu?.kind === "card" ? 216 : 184;
  const baseLeft = menu ? Math.min(menu.x, window.innerWidth - width - 8) : 0;
  const baseTop = menu ? Math.min(menu.y, window.innerHeight - 120) : 0;

  // Keep the menu fully on screen, re-measuring whenever a submenu expands
  // it (Move to… / Counters… can grow the menu past the viewport bottom).
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
  }, [menu, countersOpen, moveOpen, baseLeft, baseTop]);

  if (!menu) return null;

  const style = { left: baseLeft, top: baseTop };

  if (menu.kind === "library") {
    return (
      <div
        ref={ref}
        style={style}
        onPointerDown={(e) => e.stopPropagation()}
        className="fixed z-50 w-44 rounded-md border border-zinc-700 bg-zinc-900 py-1 text-sm shadow-2xl"
      >
        <MenuItem
          label="Draw 1"
          onClick={() => {
            send({ type: "DRAW_CARDS", count: 1 });
            onClose();
          }}
        />
        <MenuItem
          label="Draw N…"
          onClick={() => {
            onPicker("draw");
            onClose();
          }}
        />
        <MenuItem
          label="View library…"
          onClick={() => {
            onViewLibrary();
            onClose();
          }}
        />
        <MenuDivider />
        <MenuItem
          label="Shuffle"
          onClick={() => {
            send({ type: "SHUFFLE_LIBRARY" });
            onClose();
          }}
        />
      </div>
    );
  }

  const { card, zone, name } = menu;
  const onBattlefield = zone === "battlefield";

  return (
    <div
      ref={ref}
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed z-50 w-52 rounded-md border border-zinc-700 bg-zinc-900 py-1 text-sm shadow-2xl"
    >
      {QUICK[zone].map((quick) => (
        <MenuItem
          key={quick.label}
          label={quick.label}
          onClick={() => {
            send(quick.build(card.uid));
            onClose();
          }}
        />
      ))}

      {onBattlefield && (
        <>
          <MenuDivider />
          <MenuItem
            label={card.tapped ? "Untap" : "Tap"}
            onClick={() => {
              send({ type: "SET_TAPPED", uid: card.uid, value: !card.tapped });
              onClose();
            }}
          />
          <MenuItem
            label={card.faceDown ? "Turn face up" : "Turn face down"}
            onClick={() => {
              send({ type: "SET_FACE_DOWN", uid: card.uid, value: !card.faceDown });
              onClose();
            }}
          />
          <MenuItem
            label="Draw arrow to…"
            onClick={() => {
              onDrawArrowFrom(card);
              onClose();
            }}
          />
        </>
      )}

      <MenuDivider />

      <button
        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
        onClick={() => setCountersOpen((v) => !v)}
      >
        Counters… <span className="text-zinc-500">{countersOpen ? "▾" : "▸"}</span>
      </button>
      {countersOpen && <CounterEditor card={card} send={send} />}

      <MenuItem
        label="Add note…"
        onClick={() => {
          onNote(card);
          onClose();
        }}
      />
      {onBattlefield && card.attachedTo && (
        <MenuItem
          label="Detach"
          onClick={() => {
            send({ type: "ATTACH_CARD", uid: card.uid, to: null });
            onClose();
          }}
        />
      )}

      <MenuDivider />
      <button
        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
        onClick={() => setMoveOpen((v) => !v)}
      >
        Move to… <span className="text-zinc-500">{moveOpen ? "▾" : "▸"}</span>
      </button>
      {moveOpen && (
        <div className="mx-2 mb-1 rounded border border-zinc-700 bg-zinc-950 py-1">
          {moveTargets(zone).map((target) => (
            <MenuItem
              key={target.label}
              label={target.label}
              onClick={() => {
                send(target.build(card.uid));
                onClose();
              }}
            />
          ))}
        </div>
      )}

      <MenuDivider />
      <MenuItem
        label="Reveal to table"
        onClick={() => {
          send({ type: "REVEAL_CARDS", cards: [{ uid: card.uid, name }] });
          onClose();
        }}
      />
      <MenuItem
        label="Reveal to…"
        onClick={() => {
          onRevealTo(card, name);
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
