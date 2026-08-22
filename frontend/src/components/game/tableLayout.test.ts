import { describe, expect, it } from "vitest";
// type-only: no runtime dependency on @mythic/shared inside vitest
import type { PlayerView, Zone, ZoneView } from "@mythic/shared";
import { seatGrid } from "./tableLayout";

const YOU = "you";

function mkPlayer(id: string): PlayerView {
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
  for (const zone of all) zones[zone] = { kind: "count", count: 0 };
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

function players(...ids: string[]): PlayerView[] {
  return ids.map(mkPlayer);
}

/** Compact seat summary: "id@row:col/span". */
function cells(grid: ReturnType<typeof seatGrid>): string[] {
  return grid.seats.map((s) => `${s.player.id}@${s.row}:${s.col}/${s.colSpan}`);
}

describe("seatGrid", () => {
  it("seats a lone player in a single cell", () => {
    const grid = seatGrid(players(YOU), YOU);
    expect(grid.cols).toBe(1);
    expect(grid.rows).toBe(1);
    expect(cells(grid)).toEqual([`${YOU}@0:0/1`]);
  });

  it("keeps the two-player face-off: full-width rows, you at the bottom", () => {
    const grid = seatGrid(players("a", YOU), YOU);
    expect(grid.cols).toBe(1);
    expect(grid.rows).toBe(2);
    expect(cells(grid)).toEqual([`a@0:0/1`, `${YOU}@1:0/1`]);
  });

  it("gives you the whole bottom row with three players", () => {
    const grid = seatGrid(players("a", "b", YOU), YOU);
    expect(grid.cols).toBe(2);
    expect(cells(grid)).toEqual([`a@0:0/1`, `b@0:1/1`, `${YOU}@1:0/2`]);
  });

  it("makes four corners with four players, you bottom-LEFT beside your zones", () => {
    const grid = seatGrid(players("a", "b", "c", YOU), YOU);
    expect(grid.cols).toBe(2);
    expect(cells(grid)).toEqual([
      `a@0:0/1`,
      `b@0:1/1`,
      `${YOU}@1:0/1`,
      `c@1:1/1`,
    ]);
  });

  it("anchors you bottom-left spanning two of three columns with five players", () => {
    const grid = seatGrid(players("a", "b", "c", "d", YOU), YOU);
    expect(grid.cols).toBe(3);
    expect(cells(grid)).toEqual([
      `a@0:0/1`,
      `b@0:1/1`,
      `c@0:2/1`,
      `${YOU}@1:0/2`,
      `d@1:2/1`,
    ]);
  });

  it("anchors you bottom-left of a 3×2 grid with six players", () => {
    const grid = seatGrid(players("a", "b", "c", "d", "e", YOU), YOU);
    expect(grid.cols).toBe(3);
    expect(cells(grid)).toEqual([
      `a@0:0/1`,
      `b@0:1/1`,
      `c@0:2/1`,
      `${YOU}@1:0/1`,
      `d@1:1/1`,
      `e@1:2/1`,
    ]);
  });

  it("seats every player exactly once for any count", () => {
    for (let n = 1; n <= 6; n++) {
      const ids = Array.from({ length: n - 1 }, (_, i) => `p${i + 1}`).concat(YOU);
      const grid = seatGrid(players(...ids), YOU);
      const seated = grid.seats.map((s) => s.player.id).sort();
      expect(seated).toEqual([...ids].sort());
      // you anchor the bottom row; opponents keep join order around you
      const youSeat = grid.seats.find((s) => s.player.id === YOU)!;
      expect(youSeat.row).toBe(n === 1 ? 0 : 1);
      expect(youSeat.col).toBe(0);
      const opponents = grid.seats.filter((s) => s.player.id !== YOU);
      expect(opponents.map((s) => s.player.id)).toEqual(
        Array.from({ length: n - 1 }, (_, i) => `p${i + 1}`)
      );
      // nobody overlaps your cell(s) in the bottom row
      for (const s of opponents) {
        if (s.row === 1) expect(s.col).toBeGreaterThanOrEqual(youSeat.col + youSeat.colSpan);
      }
    }
  });
});
