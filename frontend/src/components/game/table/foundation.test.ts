import { describe, expect, it } from "vitest";
// type-only: no runtime dependency on @mythic/shared inside vitest
import type {
  CardView,
  GameView,
  ManaPool,
  PlayerView,
  Zone,
  ZoneView,
} from "@mythic/shared";
import type { CardDef } from "@/lib/scryfall";
import {
  battlefieldDrop,
  cardMatchesText,
  faceDef,
  findOwnCard,
  manaAfterSpend,
  manaAfterTap,
  nextPhaseAction,
  onAnyBattlefield,
  pickerMax,
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
    back: {
      name: "Insectile Aberration",
      mana_cost: "",
      type_line: "Creature — Insect Human",
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

describe("manaAfterTap", () => {
  it("adds 1 of each distinct listed color", () => {
    expect(manaAfterTap(ZERO, ["G"])).toEqual({ ...ZERO, G: 1 });
    // Sol Ring lists ["C","C"] — one distinct color, one added
    expect(manaAfterTap(ZERO, ["C", "C"])).toEqual({ ...ZERO, C: 1 });
    // Birds of Paradise lists all five
    expect(manaAfterTap(ZERO, ["W", "U", "B", "R", "G"])).toEqual({
      ...ZERO,
      W: 1,
      U: 1,
      B: 1,
      R: 1,
      G: 1,
    });
  });

  it("stacks onto an existing pool and caps at 99", () => {
    expect(manaAfterTap({ ...ZERO, G: 2 }, ["G"])).toEqual({ ...ZERO, G: 3 });
    expect(manaAfterTap({ ...ZERO, G: 99 }, ["G"])).toEqual({ ...ZERO, G: 99 });
  });

  it("ignores symbols that are not pool colors", () => {
    expect(manaAfterTap(ZERO, ["X", "GP"])).toEqual(ZERO);
    expect(manaAfterTap(ZERO, [])).toEqual(ZERO);
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
