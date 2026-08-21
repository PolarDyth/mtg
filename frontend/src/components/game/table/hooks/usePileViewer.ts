"use client";

/**
 * Pile viewer: the modal over library / graveyard / sideboard / exile —
 * yours (interactive) or an opponent's public pile (read-only). Also owns
 * the ZoneRail click behavior (a library click draws one card).
 */

import { useCallback, useState } from "react";
import type {
  Action,
  CardView,
  GameView,
  PlayerId,
  PlayerView,
  Zone,
} from "@mythic/shared";
import type { KeybindSlice } from "../keybinds";

export type PileState = {
  zone: Zone;
  /** set when viewing an opponent's public pile (read-only) */
  playerId?: PlayerId;
  highlightTop?: number;
};

export type OpenPile = (
  zone: Zone,
  opts?: { playerId?: PlayerId; highlightTop?: number }
) => void;

export function usePileViewer({
  view,
  self,
  send,
  openLibraryMenu,
}: {
  view: GameView;
  self: PlayerView | null;
  send: (action: Action) => void;
  /** the library pile's right-click menu (menu feature owns its state) */
  openLibraryMenu: (x: number, y: number) => void;
}) {
  const [pile, setPile] = useState<PileState | null>(null);

  const open: OpenPile = useCallback((zone, opts) => {
    setPile({ zone, ...opts });
  }, []);

  const openOpponent = useCallback(
    (playerId: PlayerId, zone: "graveyard" | "exile" | "command") => {
      setPile({ zone, playerId });
    },
    []
  );

  // Closing the library viewer = done searching, so shuffle — unless it was
  // opened as a "look at top N" peek, which must preserve the order.
  const close = useCallback(() => {
    if (pile && pile.zone === "library" && !pile.playerId && pile.highlightTop === undefined) {
      send({ type: "SHUFFLE_LIBRARY" });
    }
    setPile(null);
  }, [pile, send]);

  const onZoneClick = useCallback(
    (zone: Zone) => {
      if (zone === "library") {
        send({ type: "DRAW_CARDS", count: 1 });
        return;
      }
      setPile({ zone });
    },
    [send]
  );

  const onZoneContextMenu = useCallback(
    (zone: Zone, x: number, y: number) => {
      if (zone === "library") openLibraryMenu(x, y);
    },
    [openLibraryMenu]
  );

  const pileSource = pile?.playerId
    ? view.players.find((p) => p.id === pile.playerId)
    : self;
  const pileZoneView = pile && pileSource ? pileSource.zones[pile.zone] : null;
  const pileCards: CardView[] =
    pileZoneView?.kind === "cards" ? pileZoneView.cards : [];

  // catch-all Escape tier (close may shuffle — exactly like the old cascade)
  const escape = useCallback((): boolean => {
    close();
    return false;
  }, [close]);

  const keybinds: KeybindSlice = {
    viewLibrary: () => setPile({ zone: "library" }),
    viewGraveyard: () => setPile({ zone: "graveyard" }),
    viewSideboard: () => setPile({ zone: "sideboard" }),
  };

  return {
    pile,
    open,
    openOpponent,
    close,
    onZoneClick,
    onZoneContextMenu,
    pileSource,
    pileCards,
    escape,
    keybinds,
  };
}
