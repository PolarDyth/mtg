import { describe, expect, it } from "vitest";
import { mergeDuplicates, parseDecklist, totalCards } from "./decklist";

describe("parseDecklist", () => {
  it("parses the common quantity-name formats", () => {
    const result = parseDecklist(
      [
        "4 Lightning Bolt",
        "4x Mountain",
        "x2 Forest",
        "Sol Ring",
        "",
        "// a comment",
      ].join("\n")
    );
    expect(result.main).toEqual([
      { quantity: 4, name: "Lightning Bolt" },
      { quantity: 4, name: "Mountain" },
      { quantity: 2, name: "Forest" },
      { quantity: 1, name: "Sol Ring" },
    ]);
    expect(result.unparseable).toEqual([]);
  });

  it("handles set codes in brackets and collector parens", () => {
    const result = parseDecklist("4 [2XM] Lightning Bolt\n1 Mountain (302)\n4 Fire // Ice [MH1]");
    expect(result.main.map((l) => l.name)).toEqual([
      "Lightning Bolt",
      "Mountain",
      "Fire // Ice",
    ]);
  });

  it("routes sideboard cards via header and SB: prefix", () => {
    const result = parseDecklist(
      ["4 Lightning Bolt", "Sideboard", "2 Red Elemental Blast", "SB: 1 Pyroblast"].join("\n")
    );
    expect(result.main).toEqual([{ quantity: 4, name: "Lightning Bolt" }]);
    expect(result.side).toEqual([
      { quantity: 2, name: "Red Elemental Blast" },
      { quantity: 1, name: "Pyroblast" },
    ]);
  });

  it("accepts Moxfield-style headers with counts", () => {
    const result = parseDecklist(
      ["4 Lightning Bolt", "Sideboard (15)", "2 Pyroblast", "Maindeck", "1 Island"].join("\n")
    );
    expect(result.side).toEqual([{ quantity: 2, name: "Pyroblast" }]);
    expect(result.main).toEqual([
      { quantity: 4, name: "Lightning Bolt" },
      { quantity: 1, name: "Island" },
    ]);
  });

  it("routes a Commander section (both partners) out of the maindeck", () => {
    const result = parseDecklist(
      [
        "Commander",
        "1 Kodama of the West Tree",
        "1 Esika, God of the Tree",
        "Deck",
        "36 Forest",
      ].join("\n")
    );
    expect(result.commander).toEqual([
      { quantity: 1, name: "Kodama of the West Tree" },
      { quantity: 1, name: "Esika, God of the Tree" },
    ]);
    expect(result.main).toEqual([{ quantity: 36, name: "Forest" }]);
  });

  it("accepts Commanders/Command zone header variants with counts", () => {
    const withS = parseDecklist("Commanders\n1 A\nCommand Zone (2)\n1 B");
    expect(withS.commander.map((l) => l.name)).toEqual(["A", "B"]);
    expect(withS.main).toEqual([]);
    const colon = parseDecklist("Commander: 1 Ragavan");
    expect(colon.commander).toEqual([]);
    expect(colon.main).toEqual([{ quantity: 1, name: "Commander: 1 Ragavan" }]);
  });

  it("parses CSV-style Archidekt exports", () => {
    const result = parseDecklist("4,Lightning Bolt,Red,Damage\n1x,Island,,");
    expect(result.main).toEqual([
      { quantity: 4, name: "Lightning Bolt" },
      { quantity: 1, name: "Island" },
    ]);
  });

  it("flags junk lines as unparseable", () => {
    const result = parseDecklist("!!!\n4 Lightning Bolt");
    expect(result.unparseable).toEqual(["!!!"]);
    expect(result.main).toEqual([{ quantity: 4, name: "Lightning Bolt" }]);
  });
});

describe("mergeDuplicates and totalCards", () => {
  it("sums duplicate names case-insensitively", () => {
    const merged = mergeDuplicates([
      { quantity: 2, name: "Mountain" },
      { quantity: 3, name: "mountain" },
      { quantity: 1, name: "Forest" },
    ]);
    expect(totalCards(merged)).toBe(6);
    expect(merged).toHaveLength(2);
    const mountain = merged.find((l) => l.name.toLowerCase() === "mountain");
    expect(mountain?.quantity).toBe(5);
  });
});
