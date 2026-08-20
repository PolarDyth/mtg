import { describe, expect, it } from "vitest";
import { cardNameMatches } from "./scryfall";

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
