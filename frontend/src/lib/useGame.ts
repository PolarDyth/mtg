"use client";

import { useCallback, useRef, useState } from "react";
import type {
  Action,
  GameView,
  PlayerId,
  ServerMessage,
} from "@mythic/shared";
import { useGameSocket } from "./useGameSocket";
import { clearSession, loadName, loadSession, saveSession } from "./session";

/**
 * High-level game connection: joins or rejoins the room, keeps the latest
 * personalized snapshot, and exposes send(action).
 *
 * Errors before the first snapshot are fatal (bad room, expired seat);
 * later errors are transient toasts.
 */
export function useGame(code: string) {
  const [view, setView] = useState<GameView | null>(null);
  const [you, setYou] = useState<PlayerId | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const hasView = useRef(false);

  const onMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case "welcome": {
          setYou(msg.you);
          const name = loadSession(code)?.name ?? loadName() ?? "";
          saveSession(code, { token: msg.token, playerId: msg.you, name });
          break;
        }
        case "snapshot":
          hasView.current = true;
          setView(msg.state);
          break;
        case "error":
          if (msg.message.startsWith("You were removed") || msg.message.startsWith("You were banned")) {
            // kicked/banned by the host — the seat is gone and rejoining is
            // pointless (or blocked), so leave the game URL entirely
            clearSession(code);
            window.location.replace("/");
            return;
          }
          if (hasView.current) setToast(msg.message);
          else setFatal(msg.message);
          break;
      }
    },
    [code]
  );

  const onOpen = useCallback(
    (send: (data: unknown) => void) => {
      const session = loadSession(code);
      if (session?.token) {
        send({ kind: "rejoin", code, token: session.token });
        return;
      }
      const name = loadName();
      if (!name) {
        setFatal("no display name — go back and pick one");
        return;
      }
      send({ kind: "join", code, name });
    },
    [code]
  );

  const { status, send: sendRaw } = useGameSocket(onMessage, onOpen, !fatal);

  const send = useCallback(
    (action: Action) => sendRaw({ kind: "action", action }),
    [sendRaw]
  );

  const clearToast = useCallback(() => setToast(null), []);

  return { view, you, status, fatal, toast, clearToast, send };
}
