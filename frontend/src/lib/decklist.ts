// Decklist parser: accepts the common plain-text formats people paste from
// Scryfall, Moxfield, Archidekt exports, or typed by hand.

export type ParsedLine = {
  quantity: number;
  name: string;
};

export type ParseResult = {
  main: ParsedLine[];
  side: ParsedLine[];
  /** "Commander"/"Commanders" section — Moxfield/Archidekt exports put
   *  partner pairs here instead of burying them in the 99. */
  commander: ParsedLine[];
  unparseable: string[];
};

// "4 Name", "4x Name", "Name" — quantity optional, set codes stripped.
const CARD_LINE =
  /^\s*(?:[xX]?(\d{1,2})[xX]?\s+)?(?:\[[^\]]+\]\s*)?(.+?)\s*(?:\[[^\]]+\])?\s*(?:\([^)]*\)\s*\d*)?$/;

// "4,Name,..." — CSV style (Archidekt export)
const CSV_LINE = /^\s*"?(\d{1,3})x?"?,\s*"?([^",]+)"?/;

const SIDE_HEADERS = /^(sideboard|sb)\s*:?\s*(?:\(\d+\))?$/i;
const MAIN_HEADERS = /^(main|maindeck|deck)\s*:?\s*(?:\(\d+\))?$/i;
const COMMANDER_HEADERS = /^(commanders?|command zone)\s*:?\s*(?:\(\d+\))?$/i;
const COMMENT = /^\/\//;

export function parseDecklist(text: string): ParseResult {
  const result: ParseResult = { main: [], side: [], commander: [], unparseable: [] };
  let board: "main" | "side" | "commander" = "main";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || COMMENT.test(line)) continue;
    if (SIDE_HEADERS.test(line)) {
      board = "side";
      continue;
    }
    if (COMMANDER_HEADERS.test(line)) {
      board = "commander";
      continue;
    }
    if (MAIN_HEADERS.test(line)) {
      board = "main";
      continue;
    }

    let quantity = 1;
    let name = "";

    const csv = line.match(CSV_LINE);
    const card = line.match(CARD_LINE);
    if (csv && line.includes(",")) {
      quantity = parseInt(csv[1], 10);
      name = csv[2].trim();
    } else if (card) {
      if (card[1]) quantity = parseInt(card[1], 10);
      name = card[2].replace(/\s+/g, " ").trim();
    }

    // "SB: 1 Card" prefix marks sideboard without a header
    const sbPrefix = name.match(/^SB\s*:\s*(\d{0,2})\s*(.*)$/i);
    let target = board;
    if (sbPrefix) {
      if (sbPrefix[1]) quantity = parseInt(sbPrefix[1], 10);
      name = sbPrefix[2].trim();
      target = "side";
    }

    if (
      !name ||
      name.length > 100 ||
      !/[a-zA-Z0-9]/.test(name) || // punctuation-only junk
      quantity < 1 ||
      quantity > 99
    ) {
      result.unparseable.push(line);
      continue;
    }

    result[target].push({ quantity, name });
  }

  return result;
}

/** Merge duplicate names, summing quantities. */
export function mergeDuplicates(lines: ParsedLine[]): ParsedLine[] {
  const byName = new Map<string, ParsedLine>();
  for (const line of lines) {
    const key = line.name.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + line.quantity);
    } else {
      byName.set(key, { ...line });
    }
  }
  return [...byName.values()];
}

export function totalCards(lines: ParsedLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}
