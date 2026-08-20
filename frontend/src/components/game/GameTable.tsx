"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Action, CardView, GameView, PlayerId, Zone } from "@mythic/shared";
import { Ban, Check, Copy, Crown, Shield, UserX } from "lucide-react";
import { useCardDefs } from "@/lib/useCardDefs";
import type { CardDef } from "@/lib/scryfall";
import Battlefield from "./Battlefield";
import ContextMenu, { type MenuState } from "./ContextMenu";
import ChatPanel from "./ChatPanel";
import HandFan from "./HandFan";
import PileModal from "./PileModal";
import TokenModal from "./TokenModal";
import ZoneRail from "./ZoneRail";

type DragState = {
  uid: string;
  from: "battlefield" | "hand";
  x: number;
  y: number;
};

type PendingDrag = {
  card: CardView;
  zone: "battlefield" | "hand";
  startX: number;
  startY: number;
  started: boolean;
};

const DRAG_THRESHOLD_PX = 5;

/** Find a card among the viewer's own zones. */
function findOwnCard(
  view: GameView,
  you: PlayerId | null,
  uid: string
): { card: CardView; zone: Zone } | null {
  const self = view.players.find((p) => p.id === you);
  if (!self) return null;
  for (const [zone, zoneView] of Object.entries(self.zones) as [Zone, typeof self.zones[Zone]][]) {
    if (zoneView.kind !== "cards") continue;
    const card = zoneView.cards.find((c) => c.uid === uid);
    if (card) return { card, zone };
  }
  return null;
}

/** The full game table: battlefield, hand, zone rail, chat, drag & drop. */
export default function GameTable({
  view,
  you,
  send,
  onOpenDeck,
}: {
  view: GameView;
  you: PlayerId | null;
  send: (action: Action) => void;
  onOpenDeck: () => void;
}) {
  const self = view.players.find((p) => p.id === you) ?? null;

  // card definitions for everything on screen
  const cardIds = useMemo(() => {
    const ids = new Set<string>();
    for (const player of view.players) {
      for (const [zone, zoneView] of Object.entries(player.zones) as [
        Zone,
        typeof player.zones[Zone],
      ][]) {
        if (zoneView.kind !== "cards") continue;
        const own = player.id === you;
        if (!own && !["battlefield", "graveyard", "exile", "command"].includes(zone)) {
          continue;
        }
        for (const card of zoneView.cards) {
          if (card.cardId) ids.add(card.cardId);
        }
      }
    }
    for (const message of view.chat) {
      if (message.kind === "reveal") {
        for (const card of message.cards) ids.add(card.cardId);
      }
    }
    return ids;
  }, [view, you]);
  const { get } = useCardDefs(cardIds);

  // UI state
  const [drag, setDrag] = useState<DragState | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [zoom, setZoom] = useState<CardDef | null>(null);
  const [pile, setPile] = useState<Zone | null>(null);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hostMenuOpen, setHostMenuOpen] = useState(false);
  const battlefieldRef = useRef<HTMLDivElement | null>(null);
  const pending = useRef<PendingDrag | null>(null);

  // --- pointer plumbing ------------------------------------------------------

  const onCardPointerDown = useCallback(
    (card: CardView, event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      const own = findOwnCard(view, you, card.uid);
      if (!own || (own.zone !== "battlefield" && own.zone !== "hand")) return;
      pending.current = {
        card,
        zone: own.zone,
        startX: event.clientX,
        startY: event.clientY,
        started: false,
      };
    },
    [view, you]
  );

  const finishDrag = useCallback(
    (x: number, y: number) => {
      const current = drag;
      setDrag(null);
      if (!current) return;

      const element = document.elementFromPoint(x, y);
      if (!element) return;

      // dropping onto another battlefield card attaches
      const cardTarget = element.closest<HTMLElement>("[data-card-uid]");
      if (cardTarget && current.from === "battlefield") {
        const hostUid = cardTarget.dataset.cardUid;
        if (hostUid && hostUid !== current.uid) {
          send({ type: "ATTACH_CARD", uid: current.uid, to: hostUid });
          return;
        }
      }

      const dropTarget = element.closest<HTMLElement>("[data-drop]");
      const drop = dropTarget?.dataset.drop;
      if (drop === "battlefield" && battlefieldRef.current) {
        const rect = battlefieldRef.current.getBoundingClientRect();
        // Your own band is always the BOTTOM one on your screen (opponents
        // render above, point-mirrored); positions are % of your band.
        const bandCount = Math.max(1, view.players.length);
        const bandHeight = rect.height / bandCount;
        const bandTop = rect.height - bandHeight;
        const px = ((x - rect.left) / rect.width) * 100;
        const py = ((y - rect.top - bandTop) / bandHeight) * 100;
        if (current.from !== "battlefield") {
          send({ type: "MOVE_CARD", uid: current.uid, to: "battlefield" });
        }
        send({
          type: "SET_POSITION",
          uid: current.uid,
          x: Math.round(Math.min(96, Math.max(4, px)) * 10) / 10,
          y: Math.round(Math.min(92, Math.max(8, py)) * 10) / 10,
        });
        return;
      }
      if (drop === "hand") {
        send({ type: "MOVE_CARD", uid: current.uid, to: "hand" });
        return;
      }
      if (drop?.startsWith("zone:")) {
        send({ type: "MOVE_CARD", uid: current.uid, to: drop.slice(5) as Zone });
      }
    },
    [drag, send, view.players]
  );

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const p = pending.current;
      if (!p) return;
      if (!p.started) {
        if (Math.hypot(event.clientX - p.startX, event.clientY - p.startY) < DRAG_THRESHOLD_PX) {
          return;
        }
        p.started = true;
        setDrag({ uid: p.card.uid, from: p.zone, x: event.clientX, y: event.clientY });
      } else {
        setDrag((d) => (d ? { ...d, x: event.clientX, y: event.clientY } : d));
      }
    }
    function onUp(event: PointerEvent) {
      const p = pending.current;
      pending.current = null;
      if (drag) {
        finishDrag(event.clientX, event.clientY);
        return;
      }
      if (p && !p.started && p.zone === "battlefield") {
        // plain click on an own battlefield card toggles tap
        send({ type: "SET_TAPPED", uid: p.card.uid, value: !p.card.tapped });
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, finishDrag, send]);

  // --- menus and overlays ------------------------------------------------------

  const onCardContextMenu = useCallback(
    (card: CardView, event: ReactMouseEvent) => {
      event.preventDefault();
      const own = findOwnCard(view, you, card.uid);
      if (!own) return;
      setMenu({
        kind: "card",
        card,
        onBattlefield: own.zone === "battlefield",
        x: event.clientX,
        y: event.clientY,
      });
    },
    [view, you]
  );

  function onPileClick(zone: Zone) {
    if (zone === "library") {
      send({ type: "DRAW_CARDS", count: 1 });
      return;
    }
    setPile(zone);
  }

  function onPileContextMenu(zone: Zone, x: number, y: number) {
    if (zone === "library") setMenu({ kind: "library", x, y });
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(view.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the code is displayed anyway
    }
  }

  function addNote(card: CardView) {
    const note = window.prompt("Sticky note for this card (leave empty to clear)");
    if (note === null) return;
    const trimmed = note.trim();
    const existing = card.annotations.filter((a) => a.trim() !== "");
    const notes = trimmed
      ? [...existing.filter((a) => a !== trimmed), trimmed].slice(0, 8)
      : existing.filter((a) => a !== "");
    send({ type: "SET_NOTES", uid: card.uid, notes });
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(null);
        setPile(null);
        setTokenOpen(false);
        setZoom(null);
        setHostMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!hostMenuOpen) return;
    const close = () => setHostMenuOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [hostMenuOpen]);

  if (!self) {
    return (
      <div className="flex flex-1 items-center justify-center text-zinc-400">
        You are not seated — refresh and rejoin.
      </div>
    );
  }

  const hand =
    self.zones.hand.kind === "cards" ? self.zones.hand.cards : [];
  const draggedDef = drag ? get(findOwnCard(view, you, drag.uid)?.card.cardId ?? null) : null;

  const pileCards =
    pile && self.zones[pile].kind === "cards" ? self.zones[pile].cards : [];

  return (
    <div className="flex min-h-screen flex-col gap-2 p-2">
      <header className="relative flex items-center gap-3">
        <button
          onClick={copyCode}
          title="Copy the room code to invite friends"
          className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-sm tracking-widest text-emerald-300 transition-colors hover:border-emerald-600"
        >
          {view.code}
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2} />
          ) : (
            <Copy className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.75} />
          )}
        </button>
        {view.format === "commander" && (
          <span
            className="flex items-center gap-1 rounded-full border border-amber-700/60 bg-amber-950/40 px-2.5 py-0.5 text-xs text-amber-200"
            title="Commander game — everyone started at 40 life"
          >
            <Crown className="h-3.5 w-3.5" strokeWidth={1.75} />
            Commander
          </span>
        )}
        <button
          onClick={onOpenDeck}
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-emerald-600"
        >
          Load deck…
        </button>
        <button
          onClick={() => setTokenOpen(true)}
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-emerald-600"
        >
          + Token
        </button>
        {you === view.hostId && (
          <div className="relative">
            <button
              onClick={() => setHostMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded border border-amber-700/60 bg-amber-950/30 px-2.5 py-1 text-xs font-medium text-amber-200 hover:border-amber-500"
            >
              <Shield className="h-3.5 w-3.5" strokeWidth={1.75} />
              Host
            </button>
            {hostMenuOpen && (
              <div
                className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-md border border-zinc-700 bg-zinc-900 py-1 text-sm shadow-2xl"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    setHostMenuOpen(false);
                    send({ type: "END_GAME" });
                  }}
                  className="block w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
                >
                  End game
                  <span className="block text-xs text-zinc-500">
                    back to the waiting room, table cleared
                  </span>
                </button>
                {view.players.length > 1 && (
                  <>
                    <div className="my-1 h-px bg-zinc-800" />
                    <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-600">
                      Remove a player
                    </p>
                    {view.players
                      .filter((p) => p.id !== you)
                      .map((player) => (
                        <div
                          key={player.id}
                          className="flex items-center gap-1 px-2 py-1"
                        >
                          <span className="min-w-0 flex-1 truncate px-1 text-zinc-300">
                            {player.name}
                            {!player.connected && (
                              <span className="ml-1.5 text-xs text-zinc-600">offline</span>
                            )}
                          </span>
                          <button
                            title={`Remove ${player.name} (they can rejoin)`}
                            onClick={() =>
                              send({ type: "KICK_PLAYER", playerId: player.id })
                            }
                            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                          >
                            <UserX className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                          <button
                            title={`Ban ${player.name} (name + IP blocked from rejoining)`}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Ban ${player.name} from this table? They won't be able to rejoin.`
                                )
                              ) {
                                send({ type: "BAN_PLAYER", playerId: player.id });
                              }
                            }}
                            className="rounded p-1.5 text-zinc-400 hover:bg-red-900/60 hover:text-red-200"
                          >
                            <Ban className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                        </div>
                      ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
        <span className="ml-auto text-xs text-zinc-600">
          drag to move · click to tap · right-click for actions
        </span>
      </header>

      <div className="flex min-h-0 flex-1 gap-2">
        <ZoneRail
          zones={self.zones}
          onPileClick={onPileClick}
          onPileContextMenu={onPileContextMenu}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Battlefield
            players={view.players}
            you={you}
            getDef={get}
            onCardPointerDown={onCardPointerDown}
            onCardContextMenu={onCardContextMenu}
            onCardHover={setZoom}
            draggedUid={drag?.uid ?? null}
            battlefieldRef={battlefieldRef}
          />
          <HandFan
            cards={hand}
            getDef={get}
            onCardPointerDown={onCardPointerDown}
            onCardContextMenu={onCardContextMenu}
            onCardHover={setZoom}
            draggedUid={drag?.uid ?? null}
          />
        </div>

        <ChatPanel view={view} you={you} send={send} />
      </div>

      {/* hover zoom */}
      {zoom && (
        <div className="pointer-events-none fixed bottom-[160px] left-[100px] z-30 rounded-lg bg-black/70 p-1 shadow-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom.normal} alt={zoom.name} className="w-56 rounded" draggable={false} />
        </div>
      )}

      {/* drag ghost */}
      {drag && draggedDef && (
        <div
          className="pointer-events-none fixed z-50"
          style={{ left: drag.x - 45, top: drag.y - 63 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={draggedDef.small}
            alt=""
            draggable={false}
            className="w-[90px] rounded-md opacity-90 shadow-2xl"
          />
        </div>
      )}
      {drag && !draggedDef && (
        <div
          className="pointer-events-none fixed z-50 flex h-[126px] w-[90px] items-center justify-center rounded-md border border-amber-700 bg-amber-950/80 text-xs text-amber-200"
          style={{ left: drag.x - 45, top: drag.y - 63 }}
        >
          card
        </div>
      )}

      <ContextMenu
        menu={menu}
        send={send}
        onClose={() => setMenu(null)}
        onNote={addNote}
      />

      {pile && (
        <PileModal
          zone={pile}
          cards={pileCards}
          getDef={get}
          canAct
          send={send}
          onClose={() => setPile(null)}
        />
      )}

      {tokenOpen && <TokenModal send={send} onClose={() => setTokenOpen(false)} />}
    </div>
  );
}
