"use client";

/**
 * Battlefield view mode: null = full table; focus modes swap in one board
 * or a you-vs-one duel; maximized = true fullscreen overlay.
 */

import { useCallback, useState } from "react";
import type { GameView, PlayerId } from "@cardessa/shared";
import { focusPlayerId, type FocusMode } from "../../tableLayout";

export function useFocusView(view: GameView) {
  const [focus, setFocus] = useState<FocusMode | null>(null);
  const [maximized, setMaximized] = useState(false);

  const openBoardFocus = useCallback((playerId: PlayerId) => {
    setFocus({ kind: "board", playerId });
    setMaximized(false);
  }, []);

  const openDuel = useCallback((playerId: PlayerId) => {
    setFocus({ kind: "duel", opponentId: playerId });
    setMaximized(false);
  }, []);

  const exitFocus = useCallback(() => {
    setFocus(null);
    setMaximized(false);
  }, []);

  const toggleMaximize = useCallback(() => setMaximized((v) => !v), []);

  // focus stays valid only while its player is seated — guarded here for the
  // ghost/overlay and again inside Battlefield for the bands (no effects)
  const focusLive =
    focus && view.players.some((p) => p.id === focusPlayerId(focus)) ? focus : null;
  const showOverlay = maximized && focusLive !== null;

  // Priority-tier Escape: a maximized board just un-maximizes (keeps the
  // focus); the catch-all tier in GameTable clears the focus via exitFocus
  const escape = useCallback((): boolean => {
    if (!maximized) return false;
    setMaximized(false);
    return true;
  }, [maximized]);

  return {
    focus,
    focusLive,
    maximized,
    showOverlay,
    openBoardFocus,
    openDuel,
    exitFocus,
    toggleMaximize,
    escape,
  };
}
