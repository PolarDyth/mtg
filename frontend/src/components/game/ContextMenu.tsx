"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Action, CardView, Zone } from "@mythic/shared";
import type { CardDef } from "@/lib/scryfall";
import type { PickerMode } from "./CountPickerModal";

export type MenuState =
  | {
      kind: "card";
      card: CardView;
      /** the zone the card currently lives in (drives the game actions) */
      zone: Zone;
      /** your own card gets the full menu; an opponent's battlefield card
       *  gets the reduced one (clone / its tokens) */
      own: boolean;
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
    // ignores the clicked card on purpose — the server rolls the pick
    { label: "Discard 1 at random", build: () => ({ type: "DISCARD_RANDOM", count: 1 }) },
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
  getDef,
  onClose,
  onNote,
  onPicker,
  onViewLibrary,
  onRevealTo,
  onDrawArrowFrom,
  onAttachFrom,
  onCounters,
  onCreateToken,
  onClone,
  onTap,
}: {
  menu: MenuState;
  send: (action: Action) => void;
  /** card-def lookup (for the "Create token…" list) */
  getDef: (id: string | null) => CardDef | null;
  onClose: () => void;
  onNote: (card: CardView) => void;
  onPicker: (mode: PickerMode) => void;
  onViewLibrary: () => void;
  /** opens the reveal audience picker for this card */
  onRevealTo: (card: CardView, name: string) => void;
  /** starts arrow targeting from this card ("Draw arrow to…") */
  onDrawArrowFrom: (card: CardView) => void;
  /** starts attach targeting from this card ("Attach to…") */
  onAttachFrom: (card: CardView) => void;
  /** opens the persistent counter popover at the menu position */
  onCounters: (card: CardView, x: number, y: number) => void;
  /** opens the count picker to mint copies of one of the card's tokens */
  onCreateToken: (token: { name: string; cardId: string }) => void;
  /** opens the count picker to clone this card */
  onClone: (card: CardView) => void;
  /** tap-toggle override (useManaPool's tapForMana — adds mana on tap-on) */
  onTap?: (card: CardView) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);

  // reset the submenus whenever a new menu opens (render-time reset pattern)
  const [prevMenu, setPrevMenu] = useState(menu);
  if (menu !== prevMenu) {
    setPrevMenu(menu);
    setMoveOpen(false);
    setTokenOpen(false);
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
  // it (Move to… / Create token… can grow the menu past the viewport bottom).
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
  }, [menu, moveOpen, tokenOpen, baseLeft, baseTop]);

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

  const { card, zone, name, own } = menu;
  const onBattlefield = zone === "battlefield";
  const relatedTokens =
    onBattlefield && card.cardId ? getDef(card.cardId)?.relatedTokens ?? [] : [];

  // Double-faced: offer the other face (nothing to transform into while a
  // card is face-down — the card back is showing, not a face).
  const transformTo: string | null = (() => {
    if (card.faceDown || !card.cardId) return null;
    const def = getDef(card.cardId);
    if (!def?.back) return null;
    return card.showBack ? def.name : def.back.name;
  })();

  // Mint-new-instances actions, shared by the full menu (own battlefield
  // cards) and the reduced one (opponents' battlefield cards): spawn copies
  // of the card's tokens, or clone the card itself. Face-down cards seen as
  // an opponent have cardId === null, so both hide naturally.
  const mintActions = (
    <>
      {relatedTokens.length > 0 && (
        <>
          <button
            className="flex w-full items-center justify-between px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
            onClick={() => setTokenOpen((v) => !v)}
          >
            Create token…{" "}
            <span className="text-zinc-500">{tokenOpen ? "▾" : "▸"}</span>
          </button>
          {tokenOpen && (
            <div className="mx-2 mb-1 rounded border border-zinc-700 bg-zinc-950 py-1">
              {relatedTokens.map((token) => (
                <MenuItem
                  key={token.id}
                  label={token.name}
                  onClick={() => {
                    onCreateToken({ name: token.name, cardId: token.id });
                    onClose();
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
      {card.cardId && (
        <MenuItem
          label="Clone…"
          onClick={() => {
            onClone(card);
            onClose();
          }}
        />
      )}
    </>
  );

  if (!own) {
    // An opponent's battlefield card: everything except minting new
    // instances would bounce off the server's ownership checks, so the
    // reduced menu only offers those.
    return (
      <div
        ref={ref}
        style={style}
        onPointerDown={(e) => e.stopPropagation()}
        className="fixed z-50 w-52 rounded-md border border-zinc-700 bg-zinc-900 py-1 text-sm shadow-2xl"
      >
        {mintActions}
        {relatedTokens.length === 0 && !card.cardId && (
          <p className="px-3 py-1.5 text-xs text-zinc-600">
            {name} — nothing to do (not your card)
          </p>
        )}
      </div>
    );
  }

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
              if (onTap) onTap(card);
              else send({ type: "SET_TAPPED", uid: card.uid, value: !card.tapped });
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
          {transformTo !== null && (
            <MenuItem
              label={`Transform to ${transformTo}`}
              onClick={() => {
                send({ type: "TRANSFORM_CARD", uid: card.uid, name: transformTo });
                onClose();
              }}
            />
          )}
          <MenuItem
            label="Draw arrow to…"
            onClick={() => {
              onDrawArrowFrom(card);
              onClose();
            }}
          />
          <MenuItem
            label="Attach to…"
            onClick={() => {
              onAttachFrom(card);
              onClose();
            }}
          />
          {mintActions}
        </>
      )}

      <MenuDivider />

      <MenuItem
        label="Counters…"
        onClick={() => {
          onCounters(card, menu.x, menu.y);
          onClose();
        }}
      />

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
