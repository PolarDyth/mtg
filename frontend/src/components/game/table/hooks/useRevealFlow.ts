"use client";

/**
 * Reveal flows: the "reveal to…" audience picker (cards chosen, waiting on
 * an audience) and the popup that raises fresh reveals landing in chat.
 * Chat present at mount already "happened" and never replays.
 */

import { useCallback, useState } from "react";
import type { Action, GameView, PlayerId } from "@cardessa/shared";
import type { RevealChatMessage } from "../../RevealPopup";

export type AudienceCards = { uid: string; name: string }[];

export function useRevealFlow({
  view,
  send,
}: {
  view: GameView;
  send: (action: Action) => void;
}) {
  // reveal popups: dismissed ids never pop up again
  const [dismissedReveals, setDismissedReveals] = useState<Set<string>>(() => new Set());
  // chat ids present at mount — their reveals must not replay
  const [chatBaseline] = useState<Set<string>>(() => new Set(view.chat.map((m) => m.id)));
  // pending "reveal to…" — cards chosen, waiting on an audience
  const [audience, setAudience] = useState<{ cards: AudienceCards } | null>(null);

  // first undismissed reveal that arrived after mount — the popup for it
  // (and the next one, once this is dismissed)
  const revealPopup = view.chat.find(
    (m): m is RevealChatMessage =>
      m.kind === "reveal" &&
      !chatBaseline.has(m.id) &&
      !dismissedReveals.has(m.id)
  ) ?? null;

  const openAudience = useCallback((cards: AudienceCards) => setAudience({ cards }), []);

  const closeAudience = useCallback(() => setAudience(null), []);

  const dismissReveal = useCallback(() => {
    if (!revealPopup) return;
    const id = revealPopup.id;
    setDismissedReveals((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, [revealPopup]);

  const confirmAudience = useCallback(
    (to: PlayerId[] | null) => {
      if (audience) {
        send({ type: "REVEAL_CARDS", cards: audience.cards, ...(to ? { to } : {}) });
      }
      setAudience(null);
    },
    [audience, send]
  );

  // priority-tier Escape entries: popup first, then the audience picker
  const escapePopup = useCallback((): boolean => {
    if (!revealPopup) return false;
    dismissReveal();
    return true;
  }, [revealPopup, dismissReveal]);

  const escapeAudience = useCallback((): boolean => {
    if (!audience) return false;
    setAudience(null);
    return true;
  }, [audience]);

  return {
    audience,
    openAudience,
    closeAudience,
    confirmAudience,
    revealPopup,
    dismissReveal,
    escapePopup,
    escapeAudience,
  };
}
