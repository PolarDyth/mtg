"use client";

// Scryfall API client. All card data is fetched browser-side (CORS is
// allowed); images are hotlinked from Scryfall's CDN.

const API = "https://api.scryfall.com";
const BATCH_LIMIT = 75; // POST /cards/collection accepts at most 75 identifiers
const BATCH_GAP_MS = 120; // good-faith rate limiting between batches
const FUZZY_LIMIT = 20; // fuzzy-search fallback attempts per resolveCards call
const FUZZY_GAP_MS = 100; // good-faith rate limiting between fuzzy lookups
const SEARCH_RETRY_MS = 1000; // wait before retrying a rate-limited search

export type CardDef = {
  id: string; // Scryfall card id
  name: string;
  mana_cost: string;
  type_line: string;
  small: string; // image URL (146×204)
  normal: string; // image URL (488×680)
  /** Mana symbols the card can produce (Scryfall's produced_mana) — drives
   *  the tap-adds-mana convenience. Distinct symbols, no amounts. */
  produced_mana: string[];
  /** Rules text (faces joined " // " for multi-face single cards) — drives
   *  the pile viewer's full-text filter. */
  oracle_text: string;
  /** The other face of a double-faced card (transform / MDFC / reversible).
   *  Splits and adventures keep their combined single identity — no back. */
  back?: CardBack;
  /** Legendary creature, or a planeswalker that says it can be your commander. */
  commanderEligible: boolean;
  /** Tokens/emblems this card creates (from Scryfall's all_parts) — drives
   *  the card menu's "Create token…" list. */
  relatedTokens: { id: string; name: string }[];
};

export type CardBack = {
  name: string;
  mana_cost: string;
  type_line: string;
  /** The back face's own rules text — Scryfall has no per-face
   *  produced_mana, so face-scoped mana parsing reads this. */
  oracle_text: string;
  small: string;
  normal: string;
};

type ScryfallCard = {
  object: string;
  id: string;
  name: string;
  /** Themed printing name (Universes Beyond flavor names, e.g. "The Dead
   *  Marshes" for an Urborg, Tomb of Yawgmoth printing). */
  flavor_name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  /** Card layout — separates double-faced cards from splits/adventures. */
  layout?: string;
  produced_mana?: string[];
  image_uris?: { small?: string; normal?: string };
  card_faces?: Array<{
    name?: string;
    mana_cost?: string;
    type_line?: string;
    oracle_text?: string;
    image_uris?: { small?: string; normal?: string };
  }>;
  /** Related printings: the card itself, its tokens/emblems, meld/combo parts. */
  all_parts?: Array<{
    id: string;
    name: string;
    component: string;
    type_line?: string;
  }>;
};

function isCommanderEligible(card: ScryfallCard): boolean {
  const types: string[] = [];
  const oracles: string[] = [];
  if (card.type_line) types.push(card.type_line);
  if (card.oracle_text) oracles.push(card.oracle_text);
  for (const face of card.card_faces ?? []) {
    if (face.type_line) types.push(face.type_line);
    if (face.oracle_text) oracles.push(face.oracle_text);
  }
  const legendaryCreature = types.some(
    (t) => /legendary/i.test(t) && /creature/i.test(t)
  );
  const commanderWalker = oracles.some((o) =>
    /can be your commander/i.test(o)
  );
  return legendaryCreature || commanderWalker;
}

/** Tokens/emblems a card creates, from Scryfall's all_parts. A part counts
 *  when its component is "token" or its type_line starts with Token/Emblem
 *  (belt and braces across Scryfall's part typing). Deduped by id, ≤8. */
export function relatedTokensOf(card: {
  all_parts?: Array<{ id: string; name: string; component: string; type_line?: string }>;
}): { id: string; name: string }[] {
  const seen = new Set<string>();
  const tokens: { id: string; name: string }[] = [];
  for (const part of card.all_parts ?? []) {
    if (seen.has(part.id)) continue;
    const isToken =
      part.component === "token" || /^(token|emblem)/i.test(part.type_line ?? "");
    if (!isToken) continue;
    seen.add(part.id);
    tokens.push({ id: part.id, name: part.name });
    if (tokens.length >= 8) break;
  }
  return tokens;
}

/** Layouts where the card has a second, swappable face. Splits, adventures,
 *  and fused cards are one combined identity — they never get a `back`. */
const DFC_LAYOUTS = new Set(["transform", "modal_dfc", "reversible_card"]);

/** Card images must come from https URLs — a hostile or tampered response
 *  must not point <img src> at an arbitrary host (IP/Referer leak). */
export function httpsUrl(url: unknown): string | null {
  if (typeof url !== "string" || url.length === 0) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** The other face of a double-faced card, or undefined. A back face without
 *  both image sizes is dropped — the front def still works, it just can't
 *  transform visually. */
function backOf(card: ScryfallCard): CardBack | undefined {
  if (!DFC_LAYOUTS.has(card.layout ?? "")) return undefined;
  const face = card.card_faces?.[1];
  const images = face?.image_uris;
  const small = httpsUrl(images?.small);
  const normal = httpsUrl(images?.normal);
  if (!face || !face.name || !small || !normal) return undefined;
  return {
    name: face.name,
    mana_cost: face.mana_cost ?? "",
    type_line: face.type_line ?? "",
    oracle_text: face.oracle_text ?? "",
    small,
    normal,
  };
}

export function toDef(card: ScryfallCard): CardDef | null {
  const front = card.card_faces?.[0];
  const images = card.image_uris ?? front?.image_uris;
  const mana = card.mana_cost || front?.mana_cost || "";
  const small = httpsUrl(images?.small);
  const normal = httpsUrl(images?.normal);
  if (!small || !normal) return null;
  return {
    id: card.id,
    name: card.name,
    mana_cost: mana,
    type_line: card.type_line ?? front?.type_line ?? "",
    small,
    normal,
    produced_mana: card.produced_mana ?? [],
    oracle_text:
      card.oracle_text ??
      card.card_faces?.map((f) => f.oracle_text ?? "").join(" // ") ??
      "",
    back: backOf(card),
    commanderEligible: isCommanderEligible(card),
    relatedTokens: relatedTokensOf(card),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Normalize a card name for matching: case-fold, collapse whitespace, and
 *  strip accents ("Lim-Dul" should match "Lim-Dûl"). */
function normalizeForMatch(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Does `input` name this card? Matches the canonical name, the front face
 *  of a split card ("wear" → "Wear // Tear"), or the flavor name of a themed
 *  printing ("the dead marshes" → Urborg, Tomb of Yawgmoth). */
export function cardNameMatches(
  input: string,
  card: { name: string; flavor_name?: string }
): boolean {
  const key = normalizeForMatch(input);
  const canonical = normalizeForMatch(card.name);
  if (key === canonical || key === canonical.split(" // ")[0].trim()) return true;
  return (
    card.flavor_name !== undefined && key === normalizeForMatch(card.flavor_name)
  );
}

export type ResolveResult = {
  /** resolved defs by the exact input name */
  defs: Map<string, CardDef>;
  missing: string[];
  /** names resolved only through the fuzzy-search fallback */
  fuzzy: string[];
};

/** Resolve unique card names via POST /cards/collection, batched, with a
 *  fuzzy-search fallback for names the collection pass can't match. */
export async function resolveCards(names: string[]): Promise<ResolveResult> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const defs = new Map<string, CardDef>();
  const missing: string[] = [];

  for (let i = 0; i < unique.length; i += BATCH_LIMIT) {
    const batch = unique.slice(i, i + BATCH_LIMIT);
    if (i > 0) await sleep(BATCH_GAP_MS);

    const response = await fetch(`${API}/cards/collection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifiers: batch.map((name) => ({ name })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Scryfall error ${response.status} — try again in a moment`);
    }

    const payload = (await response.json()) as {
      data: ScryfallCard[];
      not_found: { name?: string }[];
    };
    for (const raw of payload.data) {
      const def = toDef(raw);
      if (!def) continue;
      // Map to every input that names this card (canonical, front face, or
      // flavor name — see cardNameMatches).
      for (const input of batch) {
        if (cardNameMatches(input, raw)) defs.set(input, def);
      }
    }
    for (const nf of payload.not_found) {
      if (nf.name) missing.push(nf.name);
    }
    // Belt and braces: anything in the batch not matched counts as missing.
    for (const input of batch) {
      if (!defs.has(input) && !missing.includes(input)) missing.push(input);
    }
  }

  // Fuzzy fallback: typos and odd printings the collection endpoint can't
  // match by name. Capped + paced like the batch pass (good-faith rate
  // limit); whatever still misses stays in `missing`.
  const fuzzy: string[] = [];
  for (const name of missing.slice(0, FUZZY_LIMIT)) {
    await sleep(FUZZY_GAP_MS);
    try {
      const response = await fetch(`${API}/cards/named?fuzzy=${encodeURIComponent(name)}`);
      if (!response.ok) continue; // 404 = genuinely unknown name
      const raw = (await response.json()) as ScryfallCard;
      const def = toDef(raw);
      if (def) {
        defs.set(name, def);
        fuzzy.push(name);
      }
    } catch {
      // network hiccup — the name simply stays missing
    }
  }

  return { defs, missing: missing.filter((n) => !defs.has(n)), fuzzy };
}

/** Resolve card ids (e.g. opponent permanents you've never loaded). */
export async function resolveCardsByIds(ids: string[]): Promise<CardDef[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const defs: CardDef[] = [];
  for (let i = 0; i < unique.length; i += BATCH_LIMIT) {
    const batch = unique.slice(i, i + BATCH_LIMIT);
    if (i > 0) await sleep(BATCH_GAP_MS);
    const response = await fetch(`${API}/cards/collection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers: batch.map((id) => ({ id })) }),
    });
    if (!response.ok) {
      throw new Error(`Scryfall error ${response.status}`);
    }
    const payload = (await response.json()) as { data: ScryfallCard[] };
    for (const raw of payload.data) {
      const def = toDef(raw);
      if (def) defs.push(def);
    }
  }
  return defs;
}

/** Search via GET /cards/search. A 404 genuinely means "no matches" (→ []),
 *  but a 429/5xx or a network failure must NOT masquerade as an empty
 *  result — retry once (honoring Retry-After), then throw so callers can
 *  say "try again" instead of "nothing found". */
async function searchCards(query: string, limit: number): Promise<CardDef[]> {
  const url = `${API}/cards/search?q=${encodeURIComponent(query)}&unique=print`;
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      if (attempt === 0) {
        await sleep(SEARCH_RETRY_MS);
        continue;
      }
      throw new Error("couldn't reach Scryfall — check your connection");
    }
    if (response.ok) {
      const payload = (await response.json()) as { data: ScryfallCard[] };
      return payload.data
        .slice(0, limit)
        .map((card) => toDef(card))
        .filter((def): def is CardDef => def !== null);
    }
    if (response.status === 404) return [];
    if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter >= 1 && retryAfter <= 5
          ? retryAfter * 1000
          : SEARCH_RETRY_MS;
      await sleep(waitMs);
      continue;
    }
    throw new Error(`Scryfall search failed (${response.status}) — try again`);
  }
}

/** Search tokens and emblems by name (used by the create-token modal).
 *  Emblems are their own Scryfall type (t:emblem) — planeswalker emblems
 *  would never show under a plain t:token query. */
export async function searchTokenCards(name: string): Promise<CardDef[]> {
  return searchCards(`(t:token or t:emblem) ${name.trim()}`, 8);
}

/** Commander-eligible cards matching a name: legendary creatures plus the
 *  planeswalkers that say they can be your commander. */
export async function searchCommanderCandidates(name: string): Promise<CardDef[]> {
  return searchCards(
    `${name.trim()} ((t:legendary t:creature) or (t:planeswalker o:"can be your commander"))`,
    12
  );
}
