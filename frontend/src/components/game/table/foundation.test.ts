import { describe, expect, it } from "vitest";
// type-only: no runtime dependency on @mythic/shared inside vitest
import type {
  CardView,
  GameView,
  PlayerView,
  Zone,
  ZoneView,
} from "@mythic/shared";
import {
  battlefieldDrop,
  findOwnCard,
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
  return { id, name: id, life: 20, connected: true, hasDeck: false, zones };
}

function mkView(players: PlayerView[]): GameView {
  // only the fields the helpers read; the rest is cast-filled
  return { players } as unknown as GameView;
}

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
