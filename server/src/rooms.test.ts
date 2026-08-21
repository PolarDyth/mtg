// Room registry GC (issue #26): room-level idle sweep, the per-room sweep
// hook (lobby player GC), and teardown of rooms the hook empties.

import { describe, expect, it } from "vitest";
import { seededRng } from "./engine/rng";
import { addPlayer, makePlayer, type Game } from "./engine/state";
import { RoomManager } from "./rooms";

const HOUR = 60 * 60 * 1000;

function manager(): { rooms: RoomManager; tick: (now: number) => void } {
  let now = 1_000_000;
  const rooms = new RoomManager(seededRng(1), () => now);
  return { rooms, tick: (next) => (now = next) };
}

function seatTwo(game: Game): void {
  addPlayer(game, makePlayer(game, "Ada", "tok-ada", seededRng(2)));
  addPlayer(game, makePlayer(game, "Bob", "tok-bob", seededRng(2)));
}

describe("RoomManager.sweep", () => {
  it("deletes a room idle for over an hour with nobody connected", () => {
    const { rooms, tick } = manager();
    const game = rooms.create();
    seatTwo(game);
    game.players.forEach((p) => (p.connected = false));
    tick(1_000_000 + HOUR + 1);

    expect(rooms.sweep()).toBe(1);
    expect(rooms.get(game.code)).toBeUndefined();
  });

  it("runs the sweep hook for surviving rooms and keeps them", () => {
    const { rooms } = manager();
    const game = rooms.create();
    seatTwo(game); // everyone connected — room is live
    const seen: Game[] = [];
    rooms.onSweep = (g) => seen.push(g);

    rooms.sweep();

    expect(seen).toEqual([game]);
    expect(rooms.get(game.code)).toBeDefined();
  });

  it("tears down a room the sweep hook empties", () => {
    const { rooms } = manager();
    const game = rooms.create();
    seatTwo(game);
    game.players.forEach((p) => (p.connected = false)); // fresh disconnects:
    // the idle check won't fire yet, the hook is what clears them
    rooms.onSweep = (g) => g.players.splice(0, g.players.length);

    expect(rooms.sweep()).toBe(1);
    expect(rooms.get(game.code)).toBeUndefined();
  });
});
