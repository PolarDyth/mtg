"use client";

/**
 * Hand selection mode: group actions (discard / exile / reveal /
 * reveal to… / bottom) over checked cards in your hand.
 */

import { useCallback, useState } from "react";
import type { Action, CardView } from "@mythic/shared";
import type { CardDef } from "@/lib/scryfall";
import { faceDef } from "../foundation";
import type { KeybindSlice } from "../keybinds";
import type { AudienceCards } from "./useRevealFlow";

export function useHandSelection({
  send,
  get,
  hand,
  openAudience,
}: {
  send: (action: Action) => void;
  get: (id: string | null) => CardDef | null;
  hand: CardView[];
  openAudience: (cards: AudienceCards) => void;
}) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const selectedInHand = [...selected].filter((uid) =>
    hand.some((c) => c.uid === uid)
  );

  /** Enter selection mode without touching the checked set (actions dock). */
  const enter = useCallback(() => setSelectMode(true), []);

  const toggleSelectMode = useCallback(() => {
    if (selectMode) setSelected(new Set());
    setSelectMode(!selectMode);
  }, [selectMode]);

  const toggleSelected = useCallback((card: CardView) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(card.uid)) next.delete(card.uid);
      else next.add(card.uid);
      return next;
    });
  }, []);

  const exitSelect = useCallback(() => {
    setSelected(new Set());
    setSelectMode(false);
  }, []);

  const discardSelected = useCallback(() => {
    if (selectedInHand.length === 0) return;
    send({ type: "DISCARD_CARDS", uids: selectedInHand });
    exitSelect();
  }, [selectedInHand, send, exitSelect]);

  const exileSelected = useCallback(() => {
    if (selectedInHand.length === 0) return;
    for (const uid of selectedInHand) {
      send({ type: "MOVE_CARD", uid, to: "exile" });
    }
    exitSelect();
  }, [selectedInHand, send, exitSelect]);

  const bottomSelected = useCallback(() => {
    if (selectedInHand.length === 0) return;
    for (const uid of selectedInHand) {
      send({ type: "MOVE_CARD", uid, to: "library", index: "bottom" });
    }
    exitSelect();
  }, [selectedInHand, send, exitSelect]);

  const revealSelected = useCallback(() => {
    if (selectedInHand.length === 0) return;
    send({
      type: "REVEAL_CARDS",
      cards: selectedInHand.map((uid) => {
        const card = hand.find((c) => c.uid === uid);
        return {
          uid,
          name: faceDef(get(card?.cardId ?? null), card?.showBack)?.name ?? "Card",
        };
      }),
    });
    exitSelect();
  }, [selectedInHand, hand, get, send, exitSelect]);

  const revealToSelected = useCallback(() => {
    if (selectedInHand.length === 0) return;
    openAudience(
      selectedInHand.map((uid) => {
        const card = hand.find((c) => c.uid === uid);
        return {
          uid,
          name: faceDef(get(card?.cardId ?? null), card?.showBack)?.name ?? "Card",
        };
      })
    );
    exitSelect();
  }, [selectedInHand, hand, get, openAudience, exitSelect]);

  // catch-all Escape tier: leave selection mode (always lets the rest run)
  const escape = useCallback((): boolean => {
    exitSelect();
    return false;
  }, [exitSelect]);

  const keybinds = {
    selectAll: () => {
      setSelected(new Set(hand.map((c) => c.uid)));
      setSelectMode(true);
    },
  } satisfies KeybindSlice;

  return {
    selectMode,
    selected,
    selectedInHand,
    enter,
    toggleSelectMode,
    toggleSelected,
    exitSelect,
    discardSelected,
    exileSelected,
    bottomSelected,
    revealSelected,
    revealToSelected,
    escape,
    keybinds,
  };
}
