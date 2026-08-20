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
import { Ban, Check, Copy, Crown, Shield, Sparkles, UserX, ZoomIn } from "lucide-react";
import { useCardDefs } from "@/lib/useCardDefs";
import type { CardDef } from "@/lib/scryfall";
import {
  clampPreviewWidth,
  loadPreviewWidth,
  PREVIEW_DEFAULT,
  PREVIEW_MAX,
  PREVIEW_MIN,
  savePreviewWidth,
} from "@/lib/settings";
import ActionsModal from "./ActionsModal";
import AudiencePickerModal from "./AudiencePickerModal";
import Battlefield from "./Battlefield";
import { CARD_RATIO } from "./CardSprite";
import CardPreview from "./CardPreview";
import ContextMenu, { type MenuState } from "./ContextMenu";
import ChatPanel from "./ChatPanel";
import CountPickerModal, { type PickerMode } from "./CountPickerModal";
import HandFan from "./HandFan";
import PileModal from "./PileModal";
import RevealPopup, { type RevealChatMessage } from "./RevealPopup";
import ScryModal from "./ScryModal";
import TokenModal from "./TokenModal";
import { cardWidthFor, focusPlayerId, imageFor, type FocusMode } from "./tableLayout";
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
  const [pile, setPile] = useState<{
    zone: Zone;
    /** set when viewing an opponent's public pile (read-only) */
    playerId?: PlayerId;
    highlightTop?: number;
  } | null>(null);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const [scry, setScry] = useState<{ mode: "scry" | "surveil"; n: number } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [copied, setCopied] = useState(false);
  const [hostMenuOpen, setHostMenuOpen] = useState(false);
  const [previewMenuOpen, setPreviewMenuOpen] = useState(false);
  // user's preferred hover-preview width, persisted in localStorage
  const [previewWidth, setPreviewWidth] = useState(loadPreviewWidth);
  // reveal popups: chat ids present at mount already "happened" — their
  // reveals must not replay; dismissed ids never pop up again
  const [dismissedReveals, setDismissedReveals] = useState<Set<string>>(() => new Set());
  const [chatBaseline] = useState<Set<string>>(() => new Set(view.chat.map((m) => m.id)));
  // pending "reveal to…" — cards chosen, waiting on an audience
  const [audience, setAudience] = useState<{ cards: { uid: string; name: string }[] } | null>(
    null
  );
  // battlefield view mode: null = full table; focus modes swap in one board
  // or a you-vs-one duel, maximized = true fullscreen overlay
  const [focus, setFocus] = useState<FocusMode | null>(null);
  const [maximized, setMaximized] = useState(false);
  const battlefieldRef = useRef<HTMLDivElement | null>(null);
  const pending = useRef<PendingDrag | null>(null);

  // --- pointer plumbing ------------------------------------------------------

  const onCardPointerDown = useCallback(
    (card: CardView, event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      if (selectMode) return; // clicks toggle selection instead of dragging
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
    [view, you, selectMode]
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
        // battlefieldRef anchors to YOUR board's container in every view
        // mode (grid cell, focus board, or duel bottom half); positions are
        // % of your board in your own frame, un-mirrored.
        const rect = battlefieldRef.current.getBoundingClientRect();
        const px = ((x - rect.left) / rect.width) * 100;
        const py = ((y - rect.top) / rect.height) * 100;
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
    [drag, send]
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

  // --- fresh-reveal popup (derived, no effects) -------------------------------

  // first undismissed reveal that arrived after mount — the popup for it
  // (and the next one, once this is dismissed)
  const revealPopup = view.chat.find(
    (m): m is RevealChatMessage =>
      m.kind === "reveal" &&
      !chatBaseline.has(m.id) &&
      !dismissedReveals.has(m.id)
  ) ?? null;

  function dismissReveal() {
    if (!revealPopup) return;
    const id = revealPopup.id;
    setDismissedReveals((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  // --- menus and overlays ------------------------------------------------------

  const onCardContextMenu = useCallback(
    (card: CardView, event: ReactMouseEvent) => {
      event.preventDefault();
      const own = findOwnCard(view, you, card.uid);
      if (!own) return;
      setMenu({
        kind: "card",
        card,
        zone: own.zone,
        name: get(own.card.cardId)?.name ?? own.card.annotations[0] ?? "Card",
        x: event.clientX,
        y: event.clientY,
      });
    },
    [view, you, get]
  );

  function onPileClick(zone: Zone) {
    if (zone === "library") {
      send({ type: "DRAW_CARDS", count: 1 });
      return;
    }
    setPile({ zone });
  }

  function onPileContextMenu(zone: Zone, x: number, y: number) {
    if (zone === "library") setMenu({ kind: "library", x, y });
  }

  // Closing the library viewer = done searching, so shuffle — unless it was
  // opened as a "look at top N" peek, which must preserve the order.
  const closePile = useCallback(() => {
    if (pile && pile.zone === "library" && !pile.playerId && pile.highlightTop === undefined) {
      send({ type: "SHUFFLE_LIBRARY" });
    }
    setPile(null);
  }, [pile, send]);

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

  // --- N-action flows (dock, library menu) -------------------------------------

  function pickerMax(mode: PickerMode): number {
    switch (mode) {
      case "draw":
      case "mill":
        return 100;
      case "scry":
      case "surveil":
        return Math.min(10, libraryCount);
      case "lookTop":
        return libraryCount;
      case "revealTop":
        return Math.min(30, libraryCount);
    }
  }

  function confirmPicker(n: number) {
    const mode = picker;
    setPicker(null);
    if (!mode) return;
    if (mode === "draw") {
      send({ type: "DRAW_CARDS", count: n });
    } else if (mode === "mill") {
      send({ type: "MILL_CARDS", count: n });
    } else if (mode === "scry" || mode === "surveil") {
      setScry({ mode, n });
    } else if (mode === "lookTop") {
      setPile({ zone: "library", highlightTop: n });
    } else if (mode === "revealTop") {
      const top =
        self?.zones.library.kind === "cards" ? self.zones.library.cards.slice(0, n) : [];
      setAudience({
        cards: top.map((c) => ({ uid: c.uid, name: get(c.cardId)?.name ?? "Card" })),
      });
    }
  }

  function confirmAudience(to: PlayerId[] | null) {
    if (audience) {
      send({ type: "REVEAL_CARDS", cards: audience.cards, ...(to ? { to } : {}) });
    }
    setAudience(null);
  }

  // --- hand selection (group discard / exile / reveal / bottom) ----------------

  function toggleSelectMode() {
    if (selectMode) setSelected(new Set());
    setSelectMode(!selectMode);
  }

  function toggleSelected(card: CardView) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(card.uid)) next.delete(card.uid);
      else next.add(card.uid);
      return next;
    });
  }

  function exitSelect() {
    setSelected(new Set());
    setSelectMode(false);
  }

  function discardSelected() {
    if (selectedInHand.length === 0) return;
    send({ type: "DISCARD_CARDS", uids: selectedInHand });
    exitSelect();
  }

  function exileSelected() {
    if (selectedInHand.length === 0) return;
    for (const uid of selectedInHand) {
      send({ type: "MOVE_CARD", uid, to: "exile" });
    }
    exitSelect();
  }

  function bottomSelected() {
    if (selectedInHand.length === 0) return;
    for (const uid of selectedInHand) {
      send({ type: "MOVE_CARD", uid, to: "library", index: "bottom" });
    }
    exitSelect();
  }

  function revealSelected() {
    if (selectedInHand.length === 0) return;
    send({
      type: "REVEAL_CARDS",
      cards: selectedInHand.map((uid) => {
        const card = hand.find((c) => c.uid === uid);
        return { uid, name: get(card?.cardId ?? null)?.name ?? "Card" };
      }),
    });
    exitSelect();
  }

  function revealToSelected() {
    if (selectedInHand.length === 0) return;
    setAudience({
      cards: selectedInHand.map((uid) => {
        const card = hand.find((c) => c.uid === uid);
        return { uid, name: get(card?.cardId ?? null)?.name ?? "Card" };
      }),
    });
    exitSelect();
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (maximized) {
        setMaximized(false);
        return;
      }
      if (revealPopup) {
        const id = revealPopup.id;
        setDismissedReveals((prev) => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
        return;
      }
      if (audience) {
        setAudience(null);
        return;
      }
      setMenu(null);
      setActionsOpen(false);
      setPicker(null);
      setScry(null);
      closePile();
      if (selectMode) {
        setSelected(new Set());
        setSelectMode(false);
      }
      setTokenOpen(false);
      setZoom(null);
      setHostMenuOpen(false);
      setPreviewMenuOpen(false);
      setFocus(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maximized, selectMode, closePile, revealPopup, audience]);

  useEffect(() => {
    if (!hostMenuOpen) return;
    const close = () => setHostMenuOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [hostMenuOpen]);

  useEffect(() => {
    if (!previewMenuOpen) return;
    const close = () => setPreviewMenuOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [previewMenuOpen]);

  useEffect(() => {
    savePreviewWidth(previewWidth);
  }, [previewWidth]);

  // ctrl/⌘ + scroll while a preview is showing resizes it — the only time we
  // claim the gesture; plain scrolling (and pinch-zoom elsewhere) stays native
  useEffect(() => {
    function onWheel(event: WheelEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (!zoom) return;
      event.preventDefault();
      setPreviewWidth((w) => clampPreviewWidth(w + (event.deltaY < 0 ? 16 : -16)));
    }
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [zoom]);

  if (!self) {
    return (
      <div className="flex flex-1 items-center justify-center text-zinc-400">
        You are not seated — refresh and rejoin.
      </div>
    );
  }

  const hand =
    self.zones.hand.kind === "cards" ? self.zones.hand.cards : [];
  const libraryCount =
    self.zones.library.kind === "cards" ? self.zones.library.cards.length : 0;
  const selectedInHand = [...selected].filter((uid) =>
    hand.some((c) => c.uid === uid)
  );
  const draggedDef = drag ? get(findOwnCard(view, you, drag.uid)?.card.cardId ?? null) : null;

  // focus stays valid only while its player is seated — guarded here for the
  // ghost/overlay and again inside Battlefield for the bands (no effects)
  const focusLive =
    focus && view.players.some((p) => p.id === focusPlayerId(focus)) ? focus : null;
  const showOverlay = maximized && focusLive !== null;
  const ghostWidth = cardWidthFor(focusLive, maximized);
  const ghostHeight = Math.round(ghostWidth * CARD_RATIO);

  function openBoardFocus(playerId: PlayerId) {
    setFocus({ kind: "board", playerId });
    setMaximized(false);
  }
  function openDuel(playerId: PlayerId) {
    setFocus({ kind: "duel", opponentId: playerId });
    setMaximized(false);
  }
  function exitFocus() {
    setFocus(null);
    setMaximized(false);
  }
  function toggleMaximize() {
    setMaximized((v) => !v);
  }

  const pileSource = pile?.playerId
    ? view.players.find((p) => p.id === pile.playerId)
    : self;
  const pileZoneView = pile && pileSource ? pileSource.zones[pile.zone] : null;
  const pileCards = pileZoneView?.kind === "cards" ? pileZoneView.cards : [];

  return (
    <div className="flex h-dvh flex-col gap-2 overflow-hidden p-2">
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
        <button
          onClick={() => setActionsOpen(true)}
          title="Every game action you can take"
          className="flex items-center gap-1.5 rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-emerald-600"
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
          Actions
        </button>
        <div className="relative">
          <button
            onClick={() => setPreviewMenuOpen((v) => !v)}
            title="Card preview size (ctrl/⌘ + scroll over a card also resizes)"
            aria-label="Card preview size"
            className="flex items-center rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-emerald-600"
          >
            <ZoomIn className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          {previewMenuOpen && (
            <div
              className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-md border border-zinc-700 bg-zinc-900 p-3 shadow-2xl"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                Card preview size
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="range"
                  min={PREVIEW_MIN}
                  max={PREVIEW_MAX}
                  step={4}
                  value={previewWidth}
                  onChange={(e) => setPreviewWidth(clampPreviewWidth(Number(e.target.value)))}
                  aria-label="Card preview size"
                  className="h-1.5 min-w-0 flex-1 accent-emerald-500"
                />
                <span className="w-11 shrink-0 text-right font-mono text-xs text-zinc-400">
                  {previewWidth}px
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  onClick={() => setPreviewWidth(PREVIEW_DEFAULT)}
                  className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  Reset
                </button>
                <span className="text-right text-[10px] leading-tight text-zinc-600">
                  ctrl/⌘ + scroll over a card
                  <br />
                  also resizes
                </span>
              </div>
            </div>
          )}
        </div>
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
          {!showOverlay && (
            <Battlefield
              players={view.players}
              you={you}
              activePlayerId={view.activePlayerId}
              focus={focusLive}
              maximized={false}
              onFocus={openBoardFocus}
              onDuel={openDuel}
              onExitFocus={exitFocus}
              onToggleMaximize={toggleMaximize}
              onOpponentPile={(playerId, zone) => setPile({ zone, playerId })}
              getDef={get}
              onCardPointerDown={onCardPointerDown}
              onCardContextMenu={onCardContextMenu}
              onCardHover={setZoom}
              draggedUid={drag?.uid ?? null}
              battlefieldRef={battlefieldRef}
            />
          )}
          {selectMode && (
            <div className="bar-in flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 text-xs">
              <span className="text-zinc-500">
                {selectedInHand.length} selected
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <GroupButton label="Discard" disabled={!selectedInHand.length} onClick={discardSelected} />
                <GroupButton label="Exile" disabled={!selectedInHand.length} onClick={exileSelected} />
                <GroupButton label="Reveal" disabled={!selectedInHand.length} onClick={revealSelected} />
                <GroupButton label="Reveal to…" disabled={!selectedInHand.length} onClick={revealToSelected} />
                <GroupButton
                  label="To bottom"
                  disabled={!selectedInHand.length}
                  onClick={bottomSelected}
                />
              </div>
            </div>
          )}
          <HandFan
            cards={hand}
            getDef={get}
            onCardPointerDown={onCardPointerDown}
            onCardContextMenu={onCardContextMenu}
            onCardHover={setZoom}
            draggedUid={drag?.uid ?? null}
            selectMode={selectMode}
            selected={selected}
            onToggleSelectMode={toggleSelectMode}
            onToggleSelect={toggleSelected}
          />
        </div>

        <ChatPanel
          view={view}
          you={you}
          send={send}
          getDef={get}
          previewWidth={previewWidth}
        />
      </div>

      {/* true-fullscreen battlefield overlay (maximize while focused) */}
      {showOverlay && (
        <div className="overlay-in fixed inset-0 z-40 flex flex-col bg-zinc-950 p-1">
          <Battlefield
            players={view.players}
            you={you}
            activePlayerId={view.activePlayerId}
            focus={focusLive}
            maximized
            onFocus={openBoardFocus}
            onDuel={openDuel}
            onExitFocus={exitFocus}
            onToggleMaximize={toggleMaximize}
            onOpponentPile={(playerId, zone) => setPile({ zone, playerId })}
            getDef={get}
            onCardPointerDown={onCardPointerDown}
            onCardContextMenu={onCardContextMenu}
            onCardHover={setZoom}
            draggedUid={drag?.uid ?? null}
            battlefieldRef={battlefieldRef}
          />
        </div>
      )}

      {/* hover zoom (above the fullscreen overlay) */}
      {zoom && (
        <CardPreview
          def={zoom}
          width={previewWidth}
          className="fixed bottom-[160px] left-[100px] z-50"
        />
      )}

      {/* drag ghost */}
      {drag && draggedDef && (
        <div
          className="pointer-events-none fixed z-50"
          style={{ left: drag.x - ghostWidth / 2, top: drag.y - ghostHeight / 2 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageFor(ghostWidth) === "normal" ? draggedDef.normal : draggedDef.small}
            alt=""
            draggable={false}
            style={{ width: ghostWidth }}
            className="rounded-md opacity-90 shadow-2xl"
          />
        </div>
      )}
      {drag && !draggedDef && (
        <div
          className="pointer-events-none fixed z-50 flex items-center justify-center rounded-md border border-amber-700 bg-amber-950/80 text-xs text-amber-200"
          style={{
            left: drag.x - ghostWidth / 2,
            top: drag.y - ghostHeight / 2,
            width: ghostWidth,
            height: ghostHeight,
          }}
        >
          card
        </div>
      )}

      <ContextMenu
        menu={menu}
        send={send}
        onClose={() => setMenu(null)}
        onNote={addNote}
        onPicker={(mode) => setPicker(mode)}
        onViewLibrary={() => setPile({ zone: "library" })}
        onRevealTo={(card, name) => setAudience({ cards: [{ uid: card.uid, name }] })}
      />

      {actionsOpen && (
        <ActionsModal
          libraryCount={libraryCount}
          onPicker={(mode) => {
            setActionsOpen(false);
            setPicker(mode);
          }}
          onShuffle={() => {
            setActionsOpen(false);
            send({ type: "SHUFFLE_LIBRARY" });
          }}
          onSearchLibrary={() => {
            setActionsOpen(false);
            setPile({ zone: "library" });
          }}
          onSelectCards={() => {
            setActionsOpen(false);
            setSelectMode(true);
          }}
          onClose={() => setActionsOpen(false)}
        />
      )}

      {picker && (
        <CountPickerModal
          mode={picker}
          max={pickerMax(picker)}
          onConfirm={confirmPicker}
          onClose={() => setPicker(null)}
        />
      )}

      {scry && self.zones.library.kind === "cards" && (
        <ScryModal
          mode={scry.mode}
          cards={self.zones.library.cards.slice(0, scry.n)}
          getDef={get}
          send={send}
          onClose={() => setScry(null)}
        />
      )}

      {pile && (
        <PileModal
          zone={pile.zone}
          cards={pileCards}
          getDef={get}
          canAct={!pile.playerId}
          send={send}
          onClose={closePile}
          playerName={pile.playerId ? pileSource?.name : undefined}
          highlightTop={pile.highlightTop}
          onCardContextMenu={onCardContextMenu}
          previewWidth={previewWidth}
          onRevealTo={(cards) =>
            setAudience({
              cards: cards.map((c) => ({ uid: c.uid, name: get(c.cardId)?.name ?? "Card" })),
            })
          }
        />
      )}

      {tokenOpen && <TokenModal send={send} onClose={() => setTokenOpen(false)} />}

      {audience && (
        <AudiencePickerModal
          players={view.players.filter((p) => p.id !== you)}
          onCancel={() => setAudience(null)}
          onConfirm={confirmAudience}
        />
      )}

      {revealPopup && (
        <RevealPopup
          message={revealPopup}
          revealerName={
            view.players.find((p) => p.id === revealPopup.playerId)?.name ?? "someone"
          }
          you={you}
          players={view.players}
          getDef={get}
          previewWidth={previewWidth}
          onClose={dismissReveal}
        />
      )}
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
