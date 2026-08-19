"use client";

// localStorage cache of Scryfall card definitions. Minimal fields only so
// thousands of cards fit comfortably in the ~5MB quota. Versioned key: bump
// to invalidate old shapes (v2 added commanderEligible).

import type { CardDef } from "./scryfall";

const CACHE_KEY = "mtg:cards:v2";

type CacheShape = {
  byId: Record<string, CardDef>;
  /** normalized name → card id */
  nameIndex: Record<string, string>;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function readCache(): CacheShape {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { byId: {}, nameIndex: {} };
    const parsed = JSON.parse(raw) as CacheShape;
    if (parsed && typeof parsed === "object" && parsed.byId && parsed.nameIndex) {
      return parsed;
    }
  } catch {
    // corrupted cache — start fresh
  }
  return { byId: {}, nameIndex: {} };
}

function writeCache(cache: CacheShape): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // quota exceeded — drop the cache rather than break the app
    localStorage.removeItem(CACHE_KEY);
  }
}

export function getCardById(id: string): CardDef | null {
  return readCache().byId[id] ?? null;
}

export function getCardByName(name: string): CardDef | null {
  const cache = readCache();
  const id = cache.nameIndex[normalizeName(name)];
  return id ? (cache.byId[id] ?? null) : null;
}

export function putCards(defs: CardDef[]): void {
  if (defs.length === 0) return;
  const cache = readCache();
  for (const def of defs) {
    cache.byId[def.id] = def;
    cache.nameIndex[normalizeName(def.name)] = def.id;
  }
  writeCache(cache);
}

/** Look up several ids at once, returning only the ones present. */
export function getCardsByIds(ids: string[]): CardDef[] {
  const cache = readCache();
  return ids.map((id) => cache.byId[id]).filter(Boolean);
}
