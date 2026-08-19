"use client";

import type { PlayerId } from "@mythic/shared";

/**
 * Identity is per-tab: sessionStorage keyed by room code means two browser
 * tabs are two players, which doubles as the two-player test setup.
 */

export type StoredSession = {
  token: string;
  playerId: PlayerId;
  name: string;
};

const NAME_KEY = "mtg:name";

function roomKey(code: string): string {
  return `mtg:room:${code.trim().toUpperCase()}`;
}

export function saveName(name: string): void {
  localStorage.setItem(NAME_KEY, name);
}

export function loadName(): string | null {
  return localStorage.getItem(NAME_KEY);
}

export function saveSession(code: string, session: StoredSession): void {
  sessionStorage.setItem(roomKey(code), JSON.stringify(session));
}

export function loadSession(code: string): StoredSession | null {
  const raw = sessionStorage.getItem(roomKey(code));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (typeof parsed.token === "string" && typeof parsed.playerId === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearSession(code: string): void {
  sessionStorage.removeItem(roomKey(code));
}
