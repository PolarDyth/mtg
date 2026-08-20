"use client";

// Scryfall API client. All card data is fetched browser-side (CORS is
// allowed); images are hotlinked from Scryfall's CDN.

const API = "https://api.scryfall.com";
const BATCH_LIMIT = 75; // POST /cards/collection accepts at most 75 identifiers
const BATCH_GAP_MS = 120; // good-faith rate limiting between batches
const FUZZY_LIMIT = 20; // fuzzy-search fallback attempts per resolveCards call
const FUZZY_GAP_MS = 100; // good-faith rate limiting between fuzzy lookups

export type CardDef = {
  id: string; // Scryfall card id
  name: string;
  mana_cost: string;
  type_line: string;
  small: string; // image URL (146×204)
  normal: string; // image URL (488×680)
  /** Legendary creature, or a planeswalker that says it can be your commander. */
  commanderEligible: boolean;
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
  image_uris?: { small?: string; normal?: string };
  card_faces?: Array<{
    mana_cost?: string;
    type_line?: string;
    oracle_text?: string;
    image_uris?: { small?: string; normal?: string };
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

function toDef(card: ScryfallCard): CardDef | null {
  const front = card.card_faces?.[0];
  const images = card.image_uris ?? front?.image_uris;
  const mana = card.mana_cost || front?.mana_cost || "";
  if (!images?.small || !images?.normal) return null;
  return {
    id: card.id,
    name: card.name,
    mana_cost: mana,
    type_line: card.type_line ?? front?.type_line ?? "",
    small: images.small,
    normal: images.normal,
    commanderEligible: isCommanderEligible(card),
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

/** Search tokens and emblems by name (used by the create-token modal).
 *  Emblems are their own Scryfall type (t:emblem) — planeswalker emblems
 *  would never show under a plain t:token query. */
export async function searchTokenCards(name: string): Promise<CardDef[]> {
  const query = encodeURIComponent(`(t:token or t:emblem) ${name.trim()}`);
  const response = await fetch(`${API}/cards/search?q=${query}&unique=print`);
  if (!response.ok) return [];
  const payload = (await response.json()) as { data: ScryfallCard[] };
  return payload.data
    .slice(0, 8)
    .map((card) => toDef(card))
    .filter((def): def is CardDef => def !== null);
}

/** Commander-eligible cards matching a name: legendary creatures plus the
 *  planeswalkers that say they can be your commander. */
export async function searchCommanderCandidates(name: string): Promise<CardDef[]> {
  const query = encodeURIComponent(
    `${name.trim()} ((t:legendary t:creature) or (t:planeswalker o:"can be your commander"))`
  );
  const response = await fetch(`${API}/cards/search?q=${query}&unique=print`);
  if (!response.ok) return [];
  const payload = (await response.json()) as { data: ScryfallCard[] };
  return payload.data
    .slice(0, 12)
    .map((card) => toDef(card))
    .filter((def): def is CardDef => def !== null);
}
