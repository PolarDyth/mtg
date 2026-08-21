"use client";

/**
 * Count-driven flows ("how many?"): the CountPickerModal for draw / mill /
 * mulligan / token / clone / scry / surveil / lookTop / revealTop, the
 * ScryModal handoff afterwards, and the session's last token for Ctrl+G
 * repeats. Token creation's UI (TokenModal) lives here too.
 */

import { useCallback, useState } from "react";
import type { Action, CardView, PlayerView } from "@mythic/shared";
import type { CardDef } from "@/lib/scryfall";
import type { PickerMode } from "../../CountPickerModal";
import type { KeybindSlice } from "../keybinds";
import type { OpenPile } from "./usePileViewer";
import type { AudienceCards } from "./useRevealFlow";

/** What a token/clone picker mint runs against (name + cardId). */
export type PickerCreate = { name: string; cardId?: string };

export function usePickerFlow({
  send,
  get,
  self,
  hand,
  openPile,
  openAudience,
}: {
  send: (action: Action) => void;
  get: (id: string | null) => CardDef | null;
  self: PlayerView | null;
  hand: CardView[];
  openPile: OpenPile;
  openAudience: (cards: AudienceCards) => void;
}) {
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const [pickerCreate, setPickerCreate] = useState<PickerCreate | null>(null);
  const [scry, setScry] = useState<{ mode: "scry" | "surveil"; n: number } | null>(null);
  const [tokenOpen, setTokenOpen] = useState(false);
  // last token created this session — "create another" (Ctrl+G) resends it
  const [lastToken, setLastToken] = useState<{
    name: string;
    cardId?: string;
    count: number;
  } | null>(null);

  /** Open the count picker; token/clone modes carry their mint subject. */
  const open = useCallback((mode: PickerMode, create?: PickerCreate) => {
    setPickerCreate(create ?? null);
    setPicker(mode);
  }, []);

  const close = useCallback(() => {
    setPicker(null);
    setPickerCreate(null);
  }, []);

  const confirm = useCallback(
    (n: number) => {
      const mode = picker;
      setPicker(null);
      if (!mode) return;
      if (mode === "draw") {
        send({ type: "DRAW_CARDS", count: n });
      } else if (mode === "mill") {
        send({ type: "MILL_CARDS", count: n });
      } else if (mode === "mulligan") {
        send({ type: "MULLIGAN", draw: n });
      } else if (mode === "token" || mode === "clone") {
        if (pickerCreate) {
          const token = { ...pickerCreate, count: n };
          send({ type: "CREATE_TOKEN", ...token });
          setLastToken(token); // Ctrl+G repeats it
        }
        setPickerCreate(null);
      } else if (mode === "scry" || mode === "surveil") {
        setScry({ mode, n });
      } else if (mode === "lookTop") {
        openPile("library", { highlightTop: n });
      } else if (mode === "revealTop") {
        const top =
          self?.zones.library.kind === "cards" ? self.zones.library.cards.slice(0, n) : [];
        openAudience(
          top.map((c) => ({ uid: c.uid, name: get(c.cardId)?.name ?? "Card" }))
        );
      }
    },
    [picker, pickerCreate, send, self, get, openPile, openAudience]
  );

  const closeScry = useCallback(() => setScry(null), []);

  const openToken = useCallback(() => setTokenOpen(true), []);
  const closeToken = useCallback(() => setTokenOpen(false), []);

  // catch-all Escape tier
  const escape = useCallback((): boolean => {
    setPicker(null);
    setScry(null);
    setTokenOpen(false);
    return false;
  }, []);

  const keybinds: KeybindSlice = {
    drawMany: () => setPicker("draw"),
    millMany: () => setPicker("mill"),
    viewTopCards: () => setPicker("lookTop"),
    createToken: () => setTokenOpen(true),
    createAnotherToken: () => {
      if (lastToken) send({ type: "CREATE_TOKEN", ...lastToken });
    },
  };

  return {
    picker,
    pickerCreate,
    scry,
    tokenOpen,
    lastToken,
    open,
    close,
    confirm,
    closeScry,
    openToken,
    closeToken,
    rememberToken: setLastToken,
    escape,
    keybinds,
  };
}
