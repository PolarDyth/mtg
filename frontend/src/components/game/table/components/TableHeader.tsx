"use client";

/**
 * The table's header chrome: room code (copy), format badge, deck/token/
 * actions/shortcuts launchers, clear-arrows, the preview-size popover, and
 * the host-only menu (end game / kick / ban). Presentational — the popover
 * open state lives in useHeaderMenus so the Escape cascade can close it.
 */

import type { Dispatch, SetStateAction } from "react";
import {
  Ban,
  Check,
  Copy,
  Crown,
  Keyboard,
  LogOut,
  MessageSquarePlus,
  Shield,
  Sparkles,
  UserX,
  ZoomIn,
} from "lucide-react";
import type { Action, GameView, PlayerId } from "@cardessa/shared";
import {
  clampPreviewWidth,
  PREVIEW_DEFAULT,
  PREVIEW_MAX,
  PREVIEW_MIN,
} from "@/lib/settings";

export function TableHeader({
  view,
  you,
  send,
  onOpenDeck,
  onLeave,
  onOpenToken,
  onOpenActions,
  onOpenShortcuts,
  onOpenFeedback,
  previewWidth,
  onPreviewWidth,
  onResetPreviewPos,
  gridSnap,
  onGridSnap,
  autoClearMana,
  onAutoClearMana,
  copied,
  copyCode,
  hostMenuOpen,
  setHostMenuOpen,
  previewMenuOpen,
  setPreviewMenuOpen,
}: {
  view: GameView;
  you: PlayerId | null;
  send: (action: Action) => void;
  onOpenDeck: () => void;
  /** confirm + LEAVE_GAME + navigate home (owned by GameClient) */
  onLeave: () => void;
  onOpenToken: () => void;
  onOpenActions: () => void;
  onOpenShortcuts: () => void;
  onOpenFeedback: () => void;
  previewWidth: number;
  onPreviewWidth: (width: number) => void;
  /** forget a dragged preview position — back to the default anchor */
  onResetPreviewPos: () => void;
  /** grid-snapping preference — drops land on a 5% lattice when on */
  gridSnap: boolean;
  onGridSnap: (value: boolean) => void;
  /** auto-clear preference — your own pool empties on each phase/turn change */
  autoClearMana: boolean;
  onAutoClearMana: (value: boolean) => void;
  copied: boolean;
  copyCode: () => void;
  hostMenuOpen: boolean;
  setHostMenuOpen: Dispatch<SetStateAction<boolean>>;
  previewMenuOpen: boolean;
  setPreviewMenuOpen: Dispatch<SetStateAction<boolean>>;
}) {
  return (
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
        onClick={onOpenToken}
        className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-emerald-600"
      >
        + Token
      </button>
      <button
        onClick={onOpenActions}
        title="Every game action you can take"
        className="flex items-center gap-1.5 rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-emerald-600"
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
        Actions
      </button>
      <button
        onClick={onOpenShortcuts}
        title="Keyboard shortcuts (?)"
        className="flex items-center gap-1.5 rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-emerald-600"
      >
        <Keyboard className="h-3.5 w-3.5" strokeWidth={1.75} />
        Shortcuts
      </button>
      <button
        onClick={onOpenFeedback}
        title="Report a bug or share feedback"
        className="flex items-center gap-1.5 rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-emerald-600"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" strokeWidth={1.75} />
        Feedback
      </button>
      {view.arrows.length > 0 && (
        <button
          onClick={() => send({ type: "CLEAR_ARROWS" })}
          title="Remove every drawn arrow"
          className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-emerald-600"
        >
          Clear arrows ({view.arrows.length})
        </button>
      )}
      <div className="relative">
        <button
          onClick={() => setPreviewMenuOpen((v) => !v)}
          title="Display — card preview size & grid snapping"
          aria-label="Display settings"
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
                onChange={(e) => onPreviewWidth(clampPreviewWidth(Number(e.target.value)))}
                aria-label="Card preview size"
                className="h-1.5 min-w-0 flex-1 accent-emerald-500"
              />
              <span className="w-11 shrink-0 text-right font-mono text-xs text-zinc-400">
                {previewWidth}px
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                onClick={() => onPreviewWidth(PREVIEW_DEFAULT)}
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
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-[10px] leading-tight text-zinc-600">
                drag the grip above the art
                <br />
                to move it anywhere
              </span>
              <button
                onClick={onResetPreviewPos}
                title="Return the preview to its default spot"
                className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                Reset position
              </button>
            </div>
            <div className="my-2.5 h-px bg-zinc-800" />
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-zinc-300">Grid snapping</p>
                <p className="text-[10px] text-zinc-600">
                  drops land on a 5% grid — tidy rows
                </p>
              </div>
              <button
                role="switch"
                aria-checked={gridSnap}
                aria-label="Grid snapping"
                onClick={() => onGridSnap(!gridSnap)}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  gridSnap ? "bg-emerald-600" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                    gridSnap ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-zinc-300">Auto-clear mana</p>
                <p className="text-[10px] text-zinc-600">
                  your pool empties on each phase or turn change
                </p>
              </div>
              <button
                role="switch"
                aria-checked={autoClearMana}
                aria-label="Auto-clear mana"
                onClick={() => onAutoClearMana(!autoClearMana)}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  autoClearMana ? "bg-emerald-600" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                    autoClearMana ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </button>
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
      <button
        onClick={onLeave}
        title="Leave this game — your cards go with you, the host role transfers"
        className="flex items-center gap-1.5 rounded border border-red-900/60 px-2.5 py-1 text-xs text-red-300/80 transition-colors hover:border-red-500 hover:text-red-200"
      >
        <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
        Leave
      </button>
      <span className="ml-auto text-xs text-zinc-600">
        drag to move · click to tap · right-click for actions ·
        ctrl+right-click to draw an arrow
      </span>
    </header>
  );
}
