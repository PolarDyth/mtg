import { describe, expect, it } from "vitest";
import { cardNameMatches, relatedTokensOf } from "./scryfall";

describe("cardNameMatches", () => {
  it("matches the canonical name", () => {
    expect(cardNameMatches("Lightning Bolt", { name: "Lightning Bolt" })).toBe(true);
  });

  it("is case-insensitive and whitespace-tolerant", () => {
    expect(cardNameMatches("  lightning   BOLT ", { name: "Lightning Bolt" })).toBe(true);
  });

  it("matches the front face of a split card", () => {
    expect(cardNameMatches("Wear", { name: "Wear // Tear" })).toBe(true);
    // the full name still matches too
    expect(cardNameMatches("Wear // Tear", { name: "Wear // Tear" })).toBe(true);
    // but the back face alone does not
    expect(cardNameMatches("Tear", { name: "Wear // Tear" })).toBe(false);
  });

  it("matches Universes Beyond flavor names", () => {
    // "The Dead Marshes" is the flavor name of the LTC printing of Urborg
    expect(
      cardNameMatches("The Dead Marshes", {
        name: "Urborg, Tomb of Yawgmoth",
        flavor_name: "The Dead Marshes",
      })
    ).toBe(true);
    expect(
      cardNameMatches("the   dead marshes", {
        name: "Urborg, Tomb of Yawgmoth",
        flavor_name: "The Dead Marshes",
      })
    ).toBe(true);
  });

  it("strips accents on both sides", () => {
    expect(cardNameMatches("Lim-Dul, the Fallen", { name: "Lim-Dûl, the Fallen" })).toBe(true);
    expect(cardNameMatches("Lim-Dûl", { name: "Lim-Dûl, the Fallen" })).toBe(false);
  });

  it("rejects different names", () => {
    expect(cardNameMatches("Lightning Strike", { name: "Lightning Bolt" })).toBe(false);
    expect(
      cardNameMatches("The Dead Marshes", { name: "Urborg, Tomb of Yawgmoth" })
    ).toBe(false);
  });
});

describe("relatedTokensOf", () => {
  it("collects parts with component token and Token/Emblem type lines", () => {
    expect(
      relatedTokensOf({
        all_parts: [
          { id: "self", name: "Raise the Alarm", component: "combo_piece" },
          { id: "tok-1", name: "Soldier", component: "token", type_line: "Token Creature — Soldier" },
          { id: "em-1", name: "Jace", component: "emblem_result", type_line: "Emblem — Jace" },
        ],
      })
    ).toEqual([
      { id: "tok-1", name: "Soldier" },
      { id: "em-1", name: "Jace" },
    ]);
  });

  it("keeps parts typed as tokens even without a type_line", () => {
    expect(
      relatedTokensOf({ all_parts: [{ id: "tok-2", name: "Clue", component: "token" }] })
    ).toEqual([{ id: "tok-2", name: "Clue" }]);
  });

  it("ignores meld/combo parts and dedupes by id", () => {
    expect(
      relatedTokensOf({
        all_parts: [
          { id: "meld", name: "Urza", component: "meld_part", type_line: "Legendary Artifact Creature" },
          { id: "tok-1", name: "Soldier", component: "token" },
          { id: "tok-1", name: "Soldier", component: "token" },
        ],
      })
    ).toEqual([{ id: "tok-1", name: "Soldier" }]);
  });

  it("caps at 8 tokens", () => {
    const parts = Array.from({ length: 12 }, (_, i) => ({
      id: `tok-${i}`,
      name: `T${i}`,
      component: "token",
    }));
    expect(relatedTokensOf({ all_parts: parts })).toHaveLength(8);
  });

  it("returns empty with no all_parts", () => {
    expect(relatedTokensOf({})).toEqual([]);
  });
});
