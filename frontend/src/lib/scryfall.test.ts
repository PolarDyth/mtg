import { describe, expect, it } from "vitest";
import { cardNameMatches, relatedTokensOf, toDef } from "./scryfall";

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

const IMAGES = { small: "https://img/s.png", normal: "https://img/n.png" };

describe("toDef", () => {
  it("captures produced_mana and top-level oracle_text on a simple card", () => {
    const def = toDef({
      object: "card",
      id: "forest-1",
      name: "Forest",
      type_line: "Basic Land — Forest",
      oracle_text: "{T}: Add {G}.",
      produced_mana: ["G"],
      image_uris: IMAGES,
    });
    expect(def?.produced_mana).toEqual(["G"]);
    expect(def?.oracle_text).toBe("{T}: Add {G}.");
    expect(def?.back).toBeUndefined();
  });

  it("defaults produced_mana and oracle_text when Scryfall omits them", () => {
    const def = toDef({
      object: "card",
      id: "card-1",
      name: "Card",
      image_uris: IMAGES,
    });
    expect(def?.produced_mana).toEqual([]);
    expect(def?.oracle_text).toBe("");
  });

  it("rejects non-https image URLs (tampered/hypothetical hostile response)", () => {
    expect(
      toDef({
        object: "card",
        id: "card-1",
        name: "Card",
        image_uris: { small: "http://img/s.png", normal: "https://img/n.png" },
      })
    ).toBeNull();
    expect(
      toDef({
        object: "card",
        id: "card-1",
        name: "Card",
        image_uris: { small: "javascript:alert(1)", normal: "https://img/n.png" },
      })
    ).toBeNull();
  });

  it("captures the back face of a transform card", () => {
    const def = toDef({
      object: "card",
      id: "delver-1",
      name: "Delver of Secrets // Insectile Aberration",
      layout: "transform",
      card_faces: [
        {
          name: "Delver of Secrets",
          mana_cost: "{U}",
          type_line: "Creature — Human Wizard",
          oracle_text: "At the beginning of your upkeep…",
          image_uris: IMAGES,
        },
        {
          name: "Insectile Aberration",
          type_line: "Creature — Insect Human",
          oracle_text: "Flying",
          image_uris: { small: "https://img/back-s.png", normal: "https://img/back-n.png" },
        },
      ],
    });
    expect(def?.back).toEqual({
      name: "Insectile Aberration",
      mana_cost: "",
      type_line: "Creature — Insect Human",
      oracle_text: "Flying",
      small: "https://img/back-s.png",
      normal: "https://img/back-n.png",
    });
    // faces carry the oracle text; top-level oracle_text is absent on DFCs
    expect(def?.oracle_text).toContain("Flying");
    expect(def?.oracle_text).toContain(" // ");
    expect(def?.mana_cost).toBe("{U}");
  });

  it("captures the back face of an MDFC (land back side)", () => {
    const def = toDef({
      object: "card",
      id: "mdfc-1",
      name: "Binding the Old Ways // Valheim",
      layout: "modal_dfc",
      card_faces: [
        {
          name: "Binding the Old Ways",
          mana_cost: "{3}{R}",
          type_line: "Enchantment",
          image_uris: IMAGES,
        },
        {
          name: "Valheim",
          type_line: "Land",
          image_uris: { small: "https://img/val-s.png", normal: "https://img/val-n.png" },
        },
      ],
    });
    expect(def?.back?.name).toBe("Valheim");
    expect(def?.back?.type_line).toBe("Land");
    // a face Scryfall leaves without oracle text defaults to empty
    expect(def?.back?.oracle_text).toBe("");
  });

  it("gives split cards no back — they are one combined identity", () => {
    const def = toDef({
      object: "card",
      id: "split-1",
      name: "Wear // Tear",
      layout: "split",
      card_faces: [
        { name: "Wear", mana_cost: "{1}{R}", oracle_text: "Destroy target artifact.", image_uris: IMAGES },
        { name: "Tear", mana_cost: "{W}", oracle_text: "Destroy target enchantment.", image_uris: IMAGES },
      ],
    });
    expect(def?.back).toBeUndefined();
    expect(def?.oracle_text).toBe(
      "Destroy target artifact. // Destroy target enchantment."
    );
  });

  it("drops a back face without images but keeps the def", () => {
    const def = toDef({
      object: "card",
      id: "dfc-1",
      name: "Front // Back",
      layout: "transform",
      card_faces: [
        { name: "Front", image_uris: IMAGES },
        { name: "Back" }, // no image_uris on the back face
      ],
    });
    expect(def).not.toBeNull();
    expect(def?.back).toBeUndefined();
  });

  it("returns null without both front image sizes", () => {
    expect(
      toDef({ object: "card", id: "x", name: "X", image_uris: { small: "s" } })
    ).toBeNull();
  });
});
