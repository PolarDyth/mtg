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
