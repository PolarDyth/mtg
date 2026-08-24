// Seating-policy predicates for the connection layer (SEC-11 name collisions,
// SEC-13 multi-socket close race).

import { describe, expect, it } from "vitest";
import { seededRng } from "./engine/rng";
import { addPlayer, createGame, makePlayer } from "./engine/state";
import { nameTaken, seatStillHeld } from "./seating";

function gameWith(...names: string[]) {
  const game = createGame("WORD-WORD-1234");
  const rng = seededRng(7);
  for (const name of names) addPlayer(game, makePlayer(game, name, "tok", rng));
  return game;
}

describe("nameTaken", () => {
  it("matches an exact seated name", () => {
    expect(nameTaken(gameWith("alice", "bob"), "alice")).toBe(true);
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    const game = gameWith("Alice");
    expect(nameTaken(game, "ALICE")).toBe(true);
    expect(nameTaken(game, " alice ")).toBe(true);
  });

  it("passes for distinct names", () => {
    expect(nameTaken(gameWith("alice"), "alicia")).toBe(false);
  });

  it("passes when the table is empty", () => {
    expect(nameTaken(gameWith(), "alice")).toBe(false);
  });
});

describe("seatStillHeld", () => {
  const gameA = { tag: "a" };
  const gameB = { tag: "b" };

  it("is true when another connection holds the same game + playerId", () => {
    const closing = { game: gameA, playerId: "p1" };
    const other = { game: gameA, playerId: "p1" };
    expect(seatStillHeld([closing, other], closing, "p1")).toBe(true);
  });

  it("is false when the closing connection is the only one on the seat", () => {
    const closing = { game: gameA, playerId: "p1" };
    expect(seatStillHeld([closing], closing, "p1")).toBe(false);
  });

  it("ignores connections on a different game", () => {
    const closing = { game: gameA, playerId: "p1" };
    const other = { game: gameB, playerId: "p1" };
    expect(seatStillHeld([closing, other], closing, "p1")).toBe(false);
  });

  it("ignores connections on a different seat of the same game", () => {
    const closing = { game: gameA, playerId: "p1" };
    const other = { game: gameA, playerId: "p2" };
    expect(seatStillHeld([closing, other], closing, "p1")).toBe(false);
  });

  it("ignores unseated connections", () => {
    const closing = { game: gameA, playerId: "p1" };
    const unseated = { game: gameA, playerId: null };
    expect(seatStillHeld([closing, unseated], closing, "p1")).toBe(false);
  });
});
