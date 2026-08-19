"use client";

// Scryfall API client. All card data is fetched browser-side (CORS is
// allowed); images are hotlinked from Scryfall's CDN.

const API = "https://api.scryfall.com";
const BATCH_LIMIT = 75; // POST /cards/collection accepts at most 75 identifiers
const BATCH_GAP_MS = 120; // good-faith rate limiting between batches

export type CardDef = {
  id: string; // Scryfall card id
  name: string;
  mana_cost: string;
  type_line: string;
  small: string; // image URL (146×204)
  normal: string; // image URL (488×680)
};

type ScryfallCard = {
  object: string;
  id: string;
  name: string;
  mana_cost?: string;
  type_line?: string;
  image_uris?: { small?: string; normal?: string };
  card_faces?: Array<{
    mana_cost?: string;
    image_uris?: { small?: string; normal?: string };
  }>;
};

function toDef(card: ScryfallCard): CardDef | null {
  const front = card.card_faces?.[0];
  const images = card.image_uris ?? front?.image_uris;
  const mana = card.mana_cost || front?.mana_cost || "";
  if (!images?.small || !images?.normal) return null;
  return {
    id: card.id,
    name: card.name,
    mana_cost: mana,
    type_line: card.type_line ?? "",
    small: images.small,
    normal: images.normal,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type ResolveResult = {
  /** resolved defs by the exact input name */
  defs: Map<string, CardDef>;
  missing: string[];
};

/** Resolve unique card names via POST /cards/collection, batched. */
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
    const foundNames = new Set<string>();
    for (const raw of payload.data) {
      const def = toDef(raw);
      if (!def) continue;
      // Map to every input casing that matches this card's canonical name.
      const canonical = def.name.toLowerCase();
      const canonicalFront = canonical.split(" // ")[0].trim();
      for (const input of batch) {
        const key = input.toLowerCase();
        if (key === canonical || key === canonicalFront) {
          defs.set(input, def);
          foundNames.add(input);
        }
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

  return { defs, missing };
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

/** Search token cards by name (used by the create-token modal). */
export async function searchTokenCards(name: string): Promise<CardDef[]> {
  const query = encodeURIComponent(`t:token ${name.trim()}`);
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
