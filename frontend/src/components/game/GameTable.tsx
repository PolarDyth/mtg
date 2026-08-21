"use client";

/**
 * The full game table — a thin composition root, the frontend twin of the
 * server's engine/actions/index.ts. Feature state and logic live in
 * per-feature hooks under table/hooks/ (drag, arrow/attach picking, piles,
 * picker/scry flow, hand selection, reveals, focus views, preview, menus…);
 * each hook returns its keybinds slice and an escape() handler, composed
 * here into the exhaustive registry (table/keybinds.ts) and the priority
 * Escape chain (table/escape.ts). Adding a feature = a new hook file + a
 * mount below + its slice in the keybind composition.
 */

import {
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Action, CardView, GameView, PlayerId } from "@mythic/shared";
import { nameColor } from "@/lib/playerColor";
import type { KeybindId } from "@/lib/keybinds";
import ActionsModal from "./ActionsModal";
import AudiencePickerModal from "./AudiencePickerModal";
import { ArrowDraft } from "./ArrowLayer";
import Battlefield from "./Battlefield";
import CardPreview from "./CardPreview";
import ContextMenu from "./ContextMenu";
import ChatPanel from "./ChatPanel";
import CounterPopover from "./CounterPopover";
import CountPickerModal from "./CountPickerModal";
import HandFan from "./HandFan";
import PhaseBar from "./PhaseBar";
import PileModal from "./PileModal";
import RevealPopup from "./RevealPopup";
import ScryModal from "./ScryModal";
import ShortcutsModal from "./ShortcutsModal";
import TokenModal from "./TokenModal";
import ZoneRail from "./ZoneRail";
import { isCreature, nextPhaseAction, pickerMax } from "./table/foundation";
import { useEscapeChain } from "./table/escape";
import { useTableKeybinds, type KeybindHandler } from "./table/keybinds";
import { useArrowPicking } from "./table/hooks/useArrowPicking";
import { useAttachPicking } from "./table/hooks/useAttachPicking";
import { useCardDrag } from "./table/hooks/useCardDrag";
import { useCardMenu } from "./table/hooks/useCardMenu";
import { useCardPreview } from "./table/hooks/useCardPreview";
import { useChatSignals } from "./table/hooks/useChatSignals";
import { useFocusView } from "./table/hooks/useFocusView";
import { useGameActions } from "./table/hooks/useGameActions";
import { useGridSnap } from "./table/hooks/useGridSnap";
import { useHandSelection } from "./table/hooks/useHandSelection";
import { useHeaderMenus } from "./table/hooks/useHeaderMenus";
import { useHoverActions } from "./table/hooks/useHoverActions";
import { usePickerFlow } from "./table/hooks/usePickerFlow";
import { usePileViewer } from "./table/hooks/usePileViewer";
import { useRevealFlow } from "./table/hooks/useRevealFlow";
import { useTableCards } from "./table/hooks/useTableCards";
import { DragGhost } from "./table/components/DragGhost";
import { PickingBar } from "./table/components/PickingBar";
import { SelectionBar } from "./table/components/SelectionBar";
import { TableHeader } from "./table/components/TableHeader";

export default function GameTable({
  view,
  you,
  send,
  onOpenDeck,
  onLeave,
}: {
  view: GameView;
  you: PlayerId | null;
  send: (action: Action) => void;
  onOpenDeck: () => void;
  onLeave: () => void;
}) {
  const self = view.players.find((p) => p.id === you) ?? null;

  // --- features (state + logic live in the hooks) ----------------------------

  const { get } = useTableCards(view, you);
  const preview = useCardPreview();
  const gridSnap = useGridSnap();
  const headerMenus = useHeaderMenus(view);
  const focusView = useFocusView(view);
  const chatSignals = useChatSignals({ self, send });
  const drag = useCardDrag({ view, you, send, snap: gridSnap.gridSnap });
  const arrows = useArrowPicking({ view, you, send, hoverCard: preview.hoverCard });
  const attach = useAttachPicking({ view, you, send });
  const reveal = useRevealFlow({ view, send });
  const menu = useCardMenu({ view, you, get, send });
  const pile = usePileViewer({ view, self, send, openLibraryMenu: menu.openLibrary });

  const hand = self?.zones.hand.kind === "cards" ? self.zones.hand.cards : [];
  const libraryCount =
    self?.zones.library.kind === "cards" ? self.zones.library.cards.length : 0;
  const battlefield =
    self?.zones.battlefield.kind === "cards" ? self.zones.battlefield.cards : [];
  const creatureCount = battlefield.filter((card) => isCreature(card, get)).length;

  const selection = useHandSelection({
    send,
    get,
    hand,
    openAudience: reveal.openAudience,
  });
  const pickerFlow = usePickerFlow({
    send,
    get,
    self,
    openPile: pile.open,
    openAudience: reveal.openAudience,
  });
  const game = useGameActions({ view, self, send, get });
  const hoverActions = useHoverActions({
    view,
    you,
    send,
    hoverCard: preview.hoverCard,
    addNote: menu.addNote,
    startAttach: attach.start,
  });

  // the actions dock fans out across features, so its open flag lives here
  const [actionsOpen, setActionsOpen] = useState(false);

  // Every KeybindId must be covered exactly once — an id added to
  // lib/keybinds.ts without a slice below fails tsc.
  const keybinds: Record<KeybindId, KeybindHandler> = {
    ...game.keybinds,
    ...gridSnap.keybinds,
    ...pile.keybinds,
    ...pickerFlow.keybinds,
    ...arrows.keybinds,
    ...selection.keybinds,
    ...chatSignals.keybinds,
    ...hoverActions.keybinds,
  };
  const { shortcutsOpen, openShortcuts, closeShortcuts } = useTableKeybinds(keybinds);

  // Escape closes things in priority order; first true wins, the catch-all
  // tier below the priority entries all runs together (table/escape.ts).
  useEscapeChain([
    focusView.escape, // maximized board un-maximizes, focus stays
    reveal.escapePopup,
    reveal.escapeAudience,
    arrows.escape,
    attach.escape,
    // catch-all tier
    menu.escape,
    () => {
      setActionsOpen(false);
      return false;
    },
    pickerFlow.escape,
    pile.escape,
    selection.escape,
    () => {
      preview.clearZoom();
      return false;
    },
    () => {
      closeShortcuts();
      return false;
    },
    headerMenus.escape,
    () => {
      focusView.exitFocus();
      return false;
    },
  ]);

  // --- cross-feature composition (the only logic the root keeps) --------------

  // One pointer-down entry for every card surface: ctrl/⌘+right-click on a
  // battlefield card starts a sticky arrow; while selecting or picking,
  // clicks belong to those modes; otherwise the press may become a drag
  // (useCardDrag gates on button + own card, and turns a plain click on an
  // own battlefield card into a tap toggle).
  const onCardPointerDown = (card: CardView, event: ReactPointerEvent) => {
    if (arrows.maybeStartFromPointer(card, event)) return;
    if (selection.selectMode) return; // clicks toggle selection instead of dragging
    if (arrows.arrowPicking) return; // clicks pick arrow targets instead
    if (attach.attachSource) return; // clicks pick attach targets instead
    drag.begin(card, event);
  };

  // no menu while an arrow or attachment is being placed, and none for the
  // ctrl/⌘-right-click gesture that starts one
  const onCardContextMenu = (card: CardView, event: ReactMouseEvent) => {
    event.preventDefault();
    if (
      arrows.arrowPicking ||
      arrows.arrowDraft ||
      attach.attachSource ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }
    menu.open(card, event.clientX, event.clientY);
  };

  if (!self) {
    return (
      <div className="flex flex-1 items-center justify-center text-zinc-400">
        You are not seated — refresh and rejoin.
      </div>
    );
  }

  // both battlefield mounts (table + fullscreen overlay) share these props
  const battlefieldProps = {
    players: view.players,
    you,
    activePlayerId: view.activePlayerId,
    focus: focusView.focusLive,
    arrows: view.arrows,
    arrowTargetedUid: arrows.arrowTarget?.uid ?? attach.attachTarget,
    arrowTargetedPlayerId: arrows.arrowTarget?.playerId ?? null,
    onRemoveArrow: (id: string) => send({ type: "CLEAR_ARROWS", id }),
    onFocus: focusView.openBoardFocus,
    onDuel: focusView.openDuel,
    onExitFocus: focusView.exitFocus,
    onToggleMaximize: focusView.toggleMaximize,
    onOpponentPile: pile.openOpponent,
    getDef: get,
    onCardPointerDown,
    onCardContextMenu,
    onCardHover: preview.onHover,
    draggedUid: drag.draggedUid,
    battlefieldRef: drag.battlefieldRef,
  };

  const revealPopup = reveal.revealPopup;

  return (
    <div
      className={`flex h-dvh flex-col gap-2 overflow-hidden p-2 ${
        arrows.arrowPicking ? "arrow-picking" : attach.attachSource ? "attach-picking" : ""
      }`}
    >
      <TableHeader
        view={view}
        you={you}
        send={send}
        onOpenDeck={onOpenDeck}
        onLeave={onLeave}
        onOpenToken={pickerFlow.openToken}
        onOpenActions={() => setActionsOpen(true)}
        onOpenShortcuts={openShortcuts}
        previewWidth={preview.previewWidth}
        onPreviewWidth={preview.setPreviewWidth}
        gridSnap={gridSnap.gridSnap}
        onGridSnap={gridSnap.setGridSnap}
        copied={headerMenus.copied}
        copyCode={headerMenus.copyCode}
        hostMenuOpen={headerMenus.hostMenuOpen}
        setHostMenuOpen={headerMenus.setHostMenuOpen}
        previewMenuOpen={headerMenus.previewMenuOpen}
        setPreviewMenuOpen={headerMenus.setPreviewMenuOpen}
      />

      <div className="flex min-h-0 flex-1 gap-2">
        <ZoneRail
          zones={self.zones}
          onPileClick={pile.onZoneClick}
          onPileContextMenu={pile.onZoneContextMenu}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {!focusView.showOverlay && <Battlefield {...battlefieldProps} maximized={false} />}
          {selection.selectMode && (
            <SelectionBar
              count={selection.selectedInHand.length}
              onDiscard={selection.discardSelected}
              onExile={selection.exileSelected}
              onReveal={selection.revealSelected}
              onRevealTo={selection.revealToSelected}
              onBottom={selection.bottomSelected}
            />
          )}
          {arrows.arrowPicking && (
            <PickingBar
              title="Draw arrow"
              text={`from ${
                get(arrows.arrowPicking.cardId)?.name ?? "card"
              } — click a card or a player's name to point at it`}
              onCancel={arrows.cancel}
            />
          )}
          {attach.attachSource && (
            <PickingBar
              title="Attach"
              text={`${
                get(attach.attachSource.cardId)?.name ?? "card"
              } — click one of your battlefield cards to attach it`}
              onCancel={attach.cancel}
            />
          )}
          <PhaseBar
            phase={view.phase}
            turn={view.turnNumber}
            startedAt={view.startedAt}
            activeName={
              view.players.find((p) => p.id === view.activePlayerId)?.name ?? "—"
            }
            isYou={view.activePlayerId === you}
            onSelect={(phase) => send({ type: "SET_PHASE", phase })}
            onNext={() => send(nextPhaseAction(view.phase))}
          />
          <HandFan
            cards={hand}
            getDef={get}
            onCardPointerDown={onCardPointerDown}
            onCardContextMenu={onCardContextMenu}
            onCardHover={preview.onHover}
            draggedUid={drag.draggedUid}
            selectMode={selection.selectMode}
            selected={selection.selected}
            onToggleSelectMode={selection.toggleSelectMode}
            onToggleSelect={selection.toggleSelected}
          />
        </div>

        <ChatPanel
          view={view}
          you={you}
          send={send}
          getDef={get}
          previewWidth={preview.previewWidth}
          chatFocusTick={chatSignals.chatFocusTick}
          lifeFocusTick={chatSignals.lifeFocusTick}
        />
      </div>

      {/* true-fullscreen battlefield overlay (maximize while focused) */}
      {focusView.showOverlay && (
        <div className="overlay-in fixed inset-0 z-40 flex flex-col bg-zinc-950 p-1">
          <Battlefield {...battlefieldProps} maximized />
        </div>
      )}

      {/* hover zoom (above the fullscreen overlay) */}
      {preview.zoom && (
        <CardPreview
          def={preview.zoom}
          width={preview.previewWidth}
          className="fixed bottom-[160px] left-[100px] z-50"
        />
      )}

      {/* arrow rubber band while placing an arrow */}
      {arrows.arrowDraft && (
        <ArrowDraft
          fromUid={arrows.arrowDraft.fromUid}
          x={arrows.arrowDraft.x}
          y={arrows.arrowDraft.y}
          color={you ? nameColor(you) : "#6ee7b7"}
        />
      )}

      {/* drag ghost */}
      {drag.drag && (
        <DragGhost
          drag={drag.drag}
          get={get}
          view={view}
          you={you}
          focus={focusView.focusLive}
          maximized={focusView.maximized}
        />
      )}

      <ContextMenu
        menu={menu.menu}
        send={send}
        getDef={get}
        onClose={menu.close}
        onNote={menu.addNote}
        onPicker={(mode) => pickerFlow.open(mode)}
        onViewLibrary={() => pile.open("library")}
        onRevealTo={(card, name) => reveal.openAudience([{ uid: card.uid, name }])}
        onDrawArrowFrom={arrows.start}
        onAttachFrom={attach.start}
        onCounters={menu.openCounters}
        onCreateToken={(token) => pickerFlow.open("token", token)}
        onClone={(card) =>
          pickerFlow.open("clone", {
            name: get(card.cardId)?.name ?? "Card",
            cardId: card.cardId ?? undefined,
          })
        }
      />

      {menu.countersCard && menu.countersFor && (
        <CounterPopover
          card={menu.countersCard.card}
          name={
            get(menu.countersCard.card.cardId)?.name ??
            menu.countersCard.card.annotations[0] ??
            "Card"
          }
          x={menu.countersFor.x}
          y={menu.countersFor.y}
          send={send}
          onClose={menu.closeCounters}
        />
      )}

      {actionsOpen && (
        <ActionsModal
          libraryCount={libraryCount}
          creatureCount={creatureCount}
          onPicker={(mode) => {
            setActionsOpen(false);
            pickerFlow.open(mode);
          }}
          onShuffle={() => {
            setActionsOpen(false);
            send({ type: "SHUFFLE_LIBRARY" });
          }}
          onSearchLibrary={() => {
            setActionsOpen(false);
            pile.open("library");
          }}
          onSelectCards={() => {
            setActionsOpen(false);
            selection.enter();
          }}
          onBulkCounters={() => {
            setActionsOpen(false);
            game.buffCreatures();
          }}
          onClose={() => setActionsOpen(false)}
        />
      )}

      {pickerFlow.picker && (
        <CountPickerModal
          mode={pickerFlow.picker}
          max={pickerMax(pickerFlow.picker, libraryCount, hand.length)}
          initial={pickerFlow.picker === "mulligan" ? hand.length : 1}
          subject={pickerFlow.pickerCreate?.name}
          onConfirm={pickerFlow.confirm}
          onClose={pickerFlow.close}
        />
      )}

      {pickerFlow.scry && self.zones.library.kind === "cards" && (
        <ScryModal
          mode={pickerFlow.scry.mode}
          cards={self.zones.library.cards.slice(0, pickerFlow.scry.n)}
          getDef={get}
          send={send}
          onClose={pickerFlow.closeScry}
          previewWidth={preview.previewWidth}
        />
      )}

      {pile.pile && (
        <PileModal
          zone={pile.pile.zone}
          cards={pile.pileCards}
          getDef={get}
          canAct={!pile.pile.playerId}
          send={send}
          onClose={pile.close}
          playerName={pile.pile.playerId ? pile.pileSource?.name : undefined}
          highlightTop={pile.pile.highlightTop}
          onCardContextMenu={onCardContextMenu}
          previewWidth={preview.previewWidth}
          onRevealTo={(cards) =>
            reveal.openAudience(
              cards.map((c) => ({ uid: c.uid, name: get(c.cardId)?.name ?? "Card" }))
            )
          }
        />
      )}

      {pickerFlow.tokenOpen && (
        <TokenModal
          send={send}
          onCreate={pickerFlow.rememberToken}
          onClose={pickerFlow.closeToken}
        />
      )}

      {shortcutsOpen && <ShortcutsModal onClose={closeShortcuts} />}

      {reveal.audience && (
        <AudiencePickerModal
          players={view.players.filter((p) => p.id !== you)}
          onCancel={reveal.closeAudience}
          onConfirm={reveal.confirmAudience}
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
          previewWidth={preview.previewWidth}
          onClose={reveal.dismissReveal}
        />
      )}
    </div>
  );
}
