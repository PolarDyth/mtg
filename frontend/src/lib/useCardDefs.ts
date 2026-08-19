"use client";

// Keeps CardDefs available for every card on screen. The localStorage cache
// answers synchronously; anything missing (an opponent's revealed card,
// someone else's deck) is fetched by id and the version bump re-renders.

import { useCallback, useEffect, useReducer, useRef } from "react";
import { getCardById, putCards } from "./cardCache";
import { resolveCardsByIds, type CardDef } from "./scryfall";

export function useCardDefs(ids: Iterable<string>): {
  get: (id: string | null) => CardDef | null;
} {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const pending = useRef(new Set<string>());

  useEffect(() => {
    const missing = [...ids].filter(
      (id) => id && !getCardById(id) && !pending.current.has(id)
    );
    if (missing.length === 0) return;
    for (const id of missing) pending.current.add(id);
    resolveCardsByIds(missing)
      .then((defs) => {
        putCards(defs);
        bump();
      })
      .catch(() => {
        // offline or rate-limited; cards render as labeled rectangles
      })
      .finally(() => {
        for (const id of missing) pending.current.delete(id);
      });
  }, [ids]);

  const get = useCallback((id: string | null) => (id ? getCardById(id) : null), []);
  return { get };
}
