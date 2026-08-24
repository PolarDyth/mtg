"use client";

// localStorage cache of Scryfall card definitions. Minimal fields only so
// thousands of cards fit comfortably in the ~5MB quota. Versioned key: bump
// to invalidate old shapes (v2 added commanderEligible; v3 added
// relatedTokens; v4 added produced_mana, oracle_text, back; v5 added
// back.oracle_text and the dfc marker).

import { httpsUrl, type CardDef } from "./scryfall";

const CACHE_KEY = "mtg:cards:v5";

export type CacheShape = {
  byId: Record<string, CardDef>;
  /** normalized name → card id */
  nameIndex: Record<string, string>;
};

const EMPTY_CACHE: CacheShape = { byId: {}, nameIndex: {} };

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Deep-validate a parsed cache. localStorage is attacker-writable on a
 *  shared machine, so a single tampered entry (wrong-typed field, non-https
 *  image URL) invalidates the whole cache — refetching from Scryfall beats
 *  trusting it (or crashing on a non-string where the UI expects one). */
export function sanitizeCache(parsed: unknown): CacheShape {
  if (!parsed || typeof parsed !== "object") return EMPTY_CACHE;
  const { byId, nameIndex } = parsed as Partial<CacheShape>;
  if (!byId || typeof byId !== "object" || !nameIndex || typeof nameIndex !== "object") {
    return EMPTY_CACHE;
  }
  const isString = (v: unknown): v is string => typeof v === "string";
  for (const def of Object.values(byId)) {
    if (!def || typeof def !== "object") return EMPTY_CACHE;
    if (!isString(def.id) || !isString(def.name) || !isString(def.oracle_text)) {
      return EMPTY_CACHE;
    }
    if (!httpsUrl(def.small) || !httpsUrl(def.normal)) return EMPTY_CACHE;
    if (!Array.isArray(def.produced_mana) || !Array.isArray(def.relatedTokens)) {
      return EMPTY_CACHE;
    }
    if (typeof def.dfc !== "boolean") return EMPTY_CACHE;
    if (def.back !== undefined) {
      if (!isString(def.back.name) || !isString(def.back.oracle_text)) {
        return EMPTY_CACHE;
      }
      if (!httpsUrl(def.back.small) || !httpsUrl(def.back.normal)) return EMPTY_CACHE;
    }
  }
  for (const id of Object.values(nameIndex)) {
    if (!isString(id)) return EMPTY_CACHE;
  }
  return { byId, nameIndex };
}

function readCache(): CacheShape {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return EMPTY_CACHE;
    return sanitizeCache(JSON.parse(raw));
  } catch {
    // corrupted cache — start fresh
  }
  return EMPTY_CACHE;
}

/** Sweep older-version keys (mtg:cards:v1…v4) before the first write of a
 *  fresh one: a bump otherwise strands the old payload in localStorage
 *  forever, and on a nearly-full quota it can make the new write fail after
 *  every refetch. Best-effort, once per page load. */
let staleCachesEvicted = false;

function evictStaleCaches(): void {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key !== null && key.startsWith("mtg:cards:") && key !== CACHE_KEY) {
      localStorage.removeItem(key);
    }
  }
}

function writeCache(cache: CacheShape): void {
  try {
    if (!staleCachesEvicted) {
      evictStaleCaches();
      staleCachesEvicted = true;
    }
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
