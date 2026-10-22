import { describe, expect, it } from "vitest";
// type-only: no runtime dependency on @cardessa/shared inside vitest
import type {
  CardView,
  GameView,
  ManaPool,
  PlayerView,
  Zone,
  ZoneView,
} from "@cardessa/shared";
import type { CardDef } from "@/lib/scryfall";
import {
  battlefieldDrop,
  cardMatchesText,
  faceDef,
  faceOracleText,
  findOwnCard,
  manaAfterSpend,
  manaAfterTap,
  marqueeSelect,
  nextPhaseAction,
  onAnyBattlefield,
  pickerMax,
  rectsIntersect,
  tapManaYield,
} from "./foundation";

const YOU = "you";
const OTHER = "other";

function mkCard(uid: string): CardView {
  return {
    uid,
    cardId: `id-${uid}`,
    x: 50,
    y: 50,
    tapped: false,
    faceDown: false,
    counters: {},
    annotations: [],
  };
}

/** Player with the given zones as card lists (everything else is a count). */
function mkPlayer(
  id: string,
  cards: Partial<Record<Zone, CardView[]>>
): PlayerView {
  const zones = {} as Record<Zone, ZoneView>;
  const all: Zone[] = [
    "library",
    "hand",
    "battlefield",
    "graveyard",
    "exile",
    "command",
    "sideboard",
  ];
  for (const zone of all) {
    const list = cards[zone];
    zones[zone] = list ? { kind: "cards", cards: list } : { kind: "count", count: 0 };
  }
  return {
    id,
    name: id,
    life: 20,
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    connected: true,
    hasDeck: false,
    zones,
  };
}

const ZERO: ManaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

function mkView(players: PlayerView[]): GameView {
  // only the fields the helpers read; the rest is cast-filled
  return { players } as unknown as GameView;
}

function mkDef(overrides: Partial<CardDef> = {}): CardDef {
  return {
    id: "id-1",
    name: "Shivan Dragon",
    mana_cost: "{4}{R}{R}",
    type_line: "Creature — Dragon",
    small: "s.png",
    normal: "n.png",
    produced_mana: [],
    oracle_text:
      "Flying (This creature can't be blocked except by creatures with flying or reach.)",
    dfc: false,
    commanderEligible: false,
    relatedTokens: [],
    ...overrides,
  };
}

describe("cardMatchesText", () => {
  it("matches an empty needle and rejects missing defs", () => {
    expect(cardMatchesText(mkDef(), "")).toBe(true);
    expect(cardMatchesText(mkDef(), "   ")).toBe(true);
    expect(cardMatchesText(null, "dragon")).toBe(false);
  });

  it("matches the name, type line, or rules text case-insensitively", () => {
    const def = mkDef();
    expect(cardMatchesText(def, "shivan")).toBe(true);
    expect(cardMatchesText(def, "CREATURE")).toBe(true);
    expect(cardMatchesText(def, "flying")).toBe(true);
  });

  it("matches phrases inside the rules text", () => {
    expect(cardMatchesText(mkDef(), "can't be blocked")).toBe(true);
    expect(cardMatchesText(mkDef(), "creatures with flying or reach")).toBe(true);
  });

  it("rejects text absent from every field", () => {
    expect(cardMatchesText(mkDef(), "trample")).toBe(false);
    expect(cardMatchesText(mkDef(), "Shivan")).toBe(true); // sanity: name works
  });
});

describe("findOwnCard", () => {
  it("finds a card in each of your own zones", () => {
    const view = mkView([
      mkPlayer(YOU, { hand: [mkCard("h1")], battlefield: [mkCard("b1")] }),
    ]);
    expect(findOwnCard(view, YOU, "h1")?.zone).toBe("hand");
    expect(findOwnCard(view, YOU, "b1")?.zone).toBe("battlefield");
  });

  it("never matches another player's cards", () => {
    const view = mkView([mkPlayer(OTHER, { hand: [mkCard("h1")] })]);
    expect(findOwnCard(view, YOU, "h1")).toBeNull();
  });

  it("skips count-kind zones and unknown uids", () => {
    const view = mkView([mkPlayer(YOU, { hand: [mkCard("h1")] })]);
    expect(findOwnCard(view, YOU, "nope")).toBeNull();
    expect(findOwnCard(view, null, "h1")).toBeNull();
  });
});

describe("onAnyBattlefield", () => {
  it("matches your and opponents' battlefield cards only", () => {
    const view = mkView([
      mkPlayer(YOU, { battlefield: [mkCard("mine")], hand: [mkCard("my-hand")] }),
      mkPlayer(OTHER, { battlefield: [mkCard("theirs")] }),
    ]);
    expect(onAnyBattlefield(view, "mine")).toBe(true);
    expect(onAnyBattlefield(view, "theirs")).toBe(true);
    expect(onAnyBattlefield(view, "my-hand")).toBe(false);
    expect(onAnyBattlefield(view, "nope")).toBe(false);
  });
});

describe("nextPhaseAction", () => {
  it("advances one phase mid-turn", () => {
    expect(nextPhaseAction("untap")).toEqual({ type: "SET_PHASE", phase: "upkeep" });
    expect(nextPhaseAction("main1")).toEqual({
      type: "SET_PHASE",
      phase: "startCombat",
    });
  });

  it("passes the turn from the last phase", () => {
    expect(nextPhaseAction("end")).toEqual({ type: "NEXT_TURN" });
  });

  it("passes the turn for an unknown phase", () => {
    expect(nextPhaseAction("nope" as never)).toEqual({ type: "NEXT_TURN" });
  });
});

describe("pickerMax", () => {
  it("caps fixed-count modes", () => {
    expect(pickerMax("draw", 60)).toBe(100);
    expect(pickerMax("mill", 60)).toBe(100);
    expect(pickerMax("mulligan", 60)).toBe(99);
    expect(pickerMax("token", 60)).toBe(20);
    expect(pickerMax("clone", 60)).toBe(20);
  });

  it("scales library-bound modes and clamps to the library size", () => {
    expect(pickerMax("scry", 60)).toBe(10);
    expect(pickerMax("surveil", 4)).toBe(4);
    expect(pickerMax("lookTop", 12)).toBe(12);
    expect(pickerMax("revealTop", 60)).toBe(30);
    expect(pickerMax("revealTop", 7)).toBe(7);
  });

  it("caps random discard by the hand size", () => {
    expect(pickerMax("discardRandom", 60, 7)).toBe(7);
    expect(pickerMax("discardRandom", 60, 40)).toBe(30);
    expect(pickerMax("discardRandom", 60, 0)).toBe(0);
  });

  it("lets put-from-top sit below every current library card", () => {
    expect(pickerMax("putFromTop", 40)).toBe(41);
    expect(pickerMax("putFromTop", 0)).toBe(1);
  });
});

describe("faceDef", () => {
  const dfc = mkDef({
    name: "Delver of Secrets",
    dfc: true,
    back: {
      name: "Insectile Aberration",
      mana_cost: "",
      type_line: "Creature — Insect Human",
      oracle_text: "Flying",
      small: "back-s.png",
      normal: "back-n.png",
    },
  });

  it("returns the front def by default", () => {
    expect(faceDef(dfc, false)?.name).toBe("Delver of Secrets");
    expect(faceDef(dfc, undefined)?.small).toBe("s.png");
  });

  it("overlays the back face when showing it", () => {
    const back = faceDef(dfc, true);
    expect(back?.name).toBe("Insectile Aberration");
    expect(back?.small).toBe("back-s.png");
    expect(back?.normal).toBe("back-n.png");
    expect(back?.type_line).toBe("Creature — Insect Human");
    // shared fields ride along untouched
    expect(back?.id).toBe("id-1");
    expect(back?.relatedTokens).toEqual([]);
  });

  it("ignores showBack on single-faced cards and null defs", () => {
    expect(faceDef(mkDef(), true)?.name).toBe("Shivan Dragon");
    expect(faceDef(null, true)).toBeNull();
    expect(faceDef(null)).toBeNull();
  });
});

describe("faceOracleText", () => {
  const dfc = mkDef({
    dfc: true,
    oracle_text: "Front face text. // Back face text.",
    back: {
      name: "Back",
      mana_cost: "",
      type_line: "Land",
      oracle_text: "Back face text.",
      small: "back-s.png",
      normal: "back-n.png",
    },
  });

  it("returns the back face's own text when transformed", () => {
    expect(faceOracleText(dfc, true)).toBe("Back face text.");
  });

  it("splits the front segment out of the joined text for the front face", () => {
    expect(faceOracleText(dfc, false)).toBe("Front face text.");
    expect(faceOracleText(dfc)).toBe("Front face text.");
  });

  it("passes single-faced cards through untouched", () => {
    const def = mkDef();
    expect(faceOracleText(def, true)).toBe(def.oracle_text);
    expect(faceOracleText(def)).toBe(def.oracle_text);
  });

  it("treats a back-less DFC as still two-faced", () => {
    // backOf drops a back face without images — the card is still a DFC
    const noBack = mkDef({ dfc: true, oracle_text: "Front text. // Back text." });
    expect(faceOracleText(noBack, false)).toBe("Front text.");
    // the back's text is unknowable, not the front's
    expect(faceOracleText(noBack, true)).toBe("");
  });

  it("returns empty text for missing defs", () => {
    expect(faceOracleText(null, true)).toBe("");
    expect(faceOracleText(null)).toBe("");
  });
});

describe("tapManaYield", () => {
  it("counts a run of pool symbols after Add per symbol", () => {
    // Sol Ring: {T}: Add {C}{C}. — the report's undercount
    expect(tapManaYield("{T}: Add {C}{C}.", ["C"])).toEqual({ C: 2 });
    // Simic Signet: {1}, {T}: Add {G}{U}.
    expect(tapManaYield("{1}, {T}: Add {G}{U}.", ["G", "U"])).toEqual({
      G: 1,
      U: 1,
    });
    expect(tapManaYield("{T}: Add {G}.", ["G"])).toEqual({ G: 1 });
  });

  it("banks a single pip of the first listed color for any-color producers", () => {
    // City of Brass / Birds of Paradise / Lotus Petal list all five — one
    // mana, one pip
    expect(
      tapManaYield("{T}: Add one mana of any color.", ["W", "U", "B", "R", "G"])
    ).toEqual({ W: 1 });
    // "of any type" phrasing; no listed colors left → colorless
    expect(tapManaYield("Add one mana of any type.", [])).toEqual({ C: 1 });
  });

  it("banks the spelled-out amount for any-ONE-color lotus wording", () => {
    // Black Lotus / Gilded Lotus: "Add three mana of any one color."
    expect(
      tapManaYield("{T}, Sacrifice: Add three mana of any one color.", [
        "W",
        "U",
        "B",
        "R",
        "G",
      ])
    ).toEqual({ W: 3 });
    // X amounts are indeterminate — bank one, pips correct the rest
    expect(tapManaYield("Add X mana of any one color.", ["W", "U"])).toEqual({
      W: 1,
    });
  });

  it("falls back to one of each distinct listed color when the amount is indeterminate", () => {
    // Nykthos: {X}, {T}: Add an amount of {G} equal to your devotion to green.
    expect(
      tapManaYield(
        "{X}, {T}: Add an amount of {G} equal to your devotion to green.",
        ["G"]
      )
    ).toEqual({ G: 1 });
    // triggered "adds an additional" has words between Add and the symbol
    expect(
      tapManaYield("Whenever you tap a Mountain, this adds an additional {R}.", [
        "R",
      ])
    ).toEqual({ R: 1 });
  });

  it("banks nothing when the face's text never adds mana", () => {
    // Emeria's Call front: a sorcery whose back face is the producer
    expect(tapManaYield("Create two 1/1 white Human creature tokens.", ["W"])).toEqual(
      {}
    );
    expect(tapManaYield("", ["W"])).toEqual({});
  });

  it("does not treat counter additions or additional costs as production", () => {
    // "Add a +1/+1 counter" — {T} is not evidence of a mana symbol, and a
    // DFC front like this must not bank the back's colors
    expect(tapManaYield("{T}: Add a +1/+1 counter.", ["W"])).toEqual({});
    // "additional" contains no word-boundary "add", and {2} is a cost
    expect(tapManaYield("You may pay an additional {2}.", ["W"])).toEqual({});
  });

  it("routes non-pool symbol runs through the fallback", () => {
    // {S} is not a pool color — no run match, so the distinct list wins
    expect(tapManaYield("{T}: Add {S}.", ["G"])).toEqual({ G: 1 });
  });
});

describe("manaAfterTap", () => {
  it("adds the parsed gain color by color", () => {
    expect(manaAfterTap(ZERO, { G: 1 })).toEqual({ ...ZERO, G: 1 });
    expect(manaAfterTap(ZERO, { C: 2 })).toEqual({ ...ZERO, C: 2 }); // Sol Ring
    expect(manaAfterTap(ZERO, { G: 1, U: 1 })).toEqual({ ...ZERO, G: 1, U: 1 });
  });

  it("stacks onto an existing pool and caps at 99", () => {
    expect(manaAfterTap({ ...ZERO, G: 2 }, { G: 1 })).toEqual({ ...ZERO, G: 3 });
    expect(manaAfterTap({ ...ZERO, G: 99 }, { G: 2 })).toEqual({ ...ZERO, G: 99 });
  });

  it("leaves the pool alone for an empty gain", () => {
    expect(manaAfterTap(ZERO, {})).toEqual(ZERO);
  });
});

describe("manaAfterSpend", () => {
  it("removes mana, floored at zero", () => {
    expect(manaAfterSpend({ ...ZERO, G: 3 }, "G", 1)).toEqual({ ...ZERO, G: 2 });
    expect(manaAfterSpend({ ...ZERO, G: 1 }, "G", 1)).toEqual(ZERO);
    expect(manaAfterSpend(ZERO, "R", 1)).toEqual(ZERO);
  });
});

describe("battlefieldDrop", () => {
  const rect = { left: 100, top: 200, width: 400, height: 200 };

  it("converts viewport points to percentages of the board", () => {
    expect(battlefieldDrop(rect, 300, 300)).toEqual({ x: 50, y: 50 });
    expect(battlefieldDrop(rect, 200, 250)).toEqual({ x: 25, y: 25 });
  });

  it("clamps the center inside the board", () => {
    expect(battlefieldDrop(rect, 0, 0)).toEqual({ x: 4, y: 8 });
    expect(battlefieldDrop(rect, 9999, 9999)).toEqual({ x: 96, y: 92 });
  });

  it("rounds to a tenth of a percent", () => {
    const drop = battlefieldDrop(rect, 301, 303);
    // 50.2499… in float land rounds down — same as the original inline math
    expect(drop.x).toBe(50.2);
    expect(drop.y).toBe(51.5);
  });

  it("snaps to the 5% lattice when asked", () => {
    expect(battlefieldDrop(rect, 312, 305, true)).toEqual({ x: 55, y: 55 }); // 53, 52.5
    expect(battlefieldDrop(rect, 200, 250, true)).toEqual({ x: 25, y: 25 }); // already on-grid
    // clamped edges snap inward, never past the clamp
    expect(battlefieldDrop(rect, 0, 0, true)).toEqual({ x: 5, y: 10 });
    expect(battlefieldDrop(rect, 9999, 9999, true)).toEqual({ x: 95, y: 90 });
  });
});

describe("rectsIntersect / marqueeSelect", () => {
  const box = { left: 10, top: 10, width: 50, height: 40 };

  it("detects overlap, edge-touch exclusivity, and disjoint rects", () => {
    const inside = { left: 20, top: 20, width: 5, height: 5 };
    const covering = { left: 0, top: 0, width: 100, height: 100 };
    const cornerClip = { left: 55, top: 45, width: 10, height: 10 };
    const edgeTouch = { left: 60, top: 20, width: 10, height: 10 }; // touches right edge
    const disjoint = { left: 100, top: 100, width: 5, height: 5 };
    expect(rectsIntersect(box, inside)).toBe(true);
    expect(rectsIntersect(box, covering)).toBe(true);
    expect(rectsIntersect(box, cornerClip)).toBe(true); // corner clip counts
    expect(rectsIntersect(box, edgeTouch)).toBe(false); // zero-area overlap
    expect(rectsIntersect(box, disjoint)).toBe(false);
  });

  it("selects every intersecting card, preserving input order", () => {
    const cards = [
      { uid: "a", rect: { left: 12, top: 12, width: 10, height: 14 } },
      { uid: "b", rect: { left: 500, top: 500, width: 10, height: 14 } },
      { uid: "c", rect: { left: 55, top: 45, width: 8, height: 8 } },
    ];
    expect(marqueeSelect(box, cards)).toEqual(["a", "c"]);
    expect(marqueeSelect(box, [])).toEqual([]);
  });
});
