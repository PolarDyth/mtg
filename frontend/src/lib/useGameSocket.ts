"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ServerMessage } from "@cardessa/shared";

export type SocketStatus = "connecting" | "open" | "reconnecting";

const MAX_BACKOFF_MS = 10_000;

/**
 * Owns the /ws connection: JSON frames in and out, automatic reconnection
 * with exponential backoff. `onOpen` fires after every (re)connect so the
 * caller can resend its hello (join/rejoin). Pass `enabled: false` to drop
 * the connection and stop reconnecting (e.g. after a fatal error).
 */
export function useGameSocket(
  onMessage: (msg: ServerMessage) => void,
  onOpen?: (send: (data: unknown) => void) => void,
  enabled: boolean = true
) {
  const [status, setStatus] = useState<SocketStatus>("connecting");

  const msgRef = useRef(onMessage);
  const openRef = useRef(onOpen);
  useEffect(() => {
    msgRef.current = onMessage;
    openRef.current = onOpen;
  });

  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposedRef = useRef(false);

  useEffect(() => {
    disposedRef.current = false;
    if (!enabled) return;

    const connect = () => {
      if (disposedRef.current || !enabled) return;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        attemptRef.current = 0;
        setStatus("open");
        openRef.current?.((data) => ws.send(JSON.stringify(data)));
      };

      ws.onmessage = (event) => {
        try {
          msgRef.current(JSON.parse(event.data as string));
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        if (disposedRef.current || !enabled) return;
        const delay = Math.min(1000 * 2 ** attemptRef.current, MAX_BACKOFF_MS);
        attemptRef.current += 1;
        setStatus("reconnecting");
        timerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    };

    // status starts as "connecting" and only changes from socket callbacks
    connect();
    return () => {
      disposedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [enabled]);

  const send = useCallback((data: unknown): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  return { status, send };
}
