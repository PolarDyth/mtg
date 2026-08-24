import { describe, expect, it } from "vitest";
import { sanitizeCache, type CacheShape } from "./cardCache";
import type { CardDef } from "./scryfall";

function def(overrides: Partial<CardDef> = {}): CardDef {
  return {
    id: "card-1",
    name: "Lightning Bolt",
    mana_cost: "{R}",
    type_line: "Instant",
    small: "https://cards.scryfall.io/small.jpg",
    normal: "https://cards.scryfall.io/normal.jpg",
    produced_mana: [],
    oracle_text: "Deal 3 damage to any target.",
    dfc: false,
    commanderEligible: false,
    relatedTokens: [],
    ...overrides,
  };
}

const valid: CacheShape = {
  byId: { "card-1": def() },
  nameIndex: { "lightning bolt": "card-1" },
};

describe("sanitizeCache", () => {
  it("passes a valid cache through untouched", () => {
    expect(sanitizeCache(valid)).toEqual(valid);
  });

  it("rejects non-object payloads and missing halves", () => {
    expect(sanitizeCache(null).byId).toEqual({});
    expect(sanitizeCache("junk").byId).toEqual({});
    expect(sanitizeCache({ byId: {} }).byId).toEqual({});
    expect(sanitizeCache({ nameIndex: {} }).byId).toEqual({});
  });

  it("drops the whole cache when any entry has a non-https image URL", () => {
    const tampered: CacheShape = {
      byId: {
        "card-1": def({ small: "http://evil.example/small.jpg" }),
      },
      nameIndex: valid.nameIndex,
    };
    expect(sanitizeCache(tampered).byId).toEqual({});
  });

  it("drops the cache when a field the UI calls methods on isn't a string", () => {
    const bad = (overrides: Partial<CardDef>) =>
      sanitizeCache({ byId: { "card-1": def(overrides) }, nameIndex: valid.nameIndex });
    expect(bad({ oracle_text: 42 as unknown as string }).byId).toEqual({});
    expect(bad({ name: null as unknown as string }).byId).toEqual({});
    expect(bad({ produced_mana: "W" as unknown as string[] }).byId).toEqual({});
    expect(bad({ dfc: "yes" as unknown as boolean }).byId).toEqual({});
  });

  it("drops the cache when a back face is tampered", () => {
    const withBack = (back: CardDef["back"]) =>
      sanitizeCache({ byId: { "card-1": def({ back }) }, nameIndex: valid.nameIndex });
    expect(
      withBack({
        name: "Insectile Aberration",
        mana_cost: "",
        type_line: "Creature",
        oracle_text: "Flying",
        small: "javascript:alert(1)",
        normal: "https://cards.scryfall.io/normal-back.jpg",
      }).byId
    ).toEqual({});
    expect(
      withBack({
        name: "Insectile Aberration",
        mana_cost: "",
        type_line: "Creature",
        oracle_text: 42 as unknown as string,
        small: "https://cards.scryfall.io/small-back.jpg",
        normal: "https://cards.scryfall.io/normal-back.jpg",
      }).byId
    ).toEqual({});
  });

  it("drops the cache when the name index maps to a non-string", () => {
    const tampered = sanitizeCache({
      byId: valid.byId,
      nameIndex: { "lightning bolt": 7 as unknown as string },
    });
    expect(tampered.nameIndex).toEqual({});
  });
});
