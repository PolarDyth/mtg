// Game-flow tests: START_GAME, NEXT_TURN, SET_LIFE, LEAVE_GAME.

import { describe, expect, it } from "vitest";
import { act, mustFail, mustOk, setup, startWithDeck } from "./testUtils";

describe("START_GAME and NEXT_TURN", () => {
  it("starts with the first player and cycles turns", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    expect(game.started).toBe(true);
    expect(game.activePlayerId).toBe(ada.id);
    mustOk(act(game, ctx, bob, { type: "NEXT_TURN" }));
    expect(game.activePlayerId).toBe(bob.id);
    mustOk(act(game, ctx, ada, { type: "NEXT_TURN" }));
    expect(game.activePlayerId).toBe(ada.id);
  });

  it("rejects actions before the game starts", () => {
    const { game, ctx, ada } = setup();
    mustFail(act(game, ctx, ada, { type: "DRAW_CARDS", count: 1 }), "not started");
  });

  it("rejects double start", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada);
    mustFail(act(game, ctx, ada, { type: "START_GAME" }), "already started");
  });

  it("commander format sets 40 life for everyone", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    // can't switch format after start — a fresh game is needed
    mustFail(act(game, ctx, ada, { type: "START_GAME", format: "commander" }), "already started");

    const fresh = setup();
    mustOk(act(fresh.game, fresh.ctx, fresh.ada, { type: "START_GAME", format: "commander" }));
    expect(fresh.game.format).toBe("commander");
    expect(fresh.ada.life).toBe(40);
    expect(fresh.bob.life).toBe(40);
    expect(fresh.game.chat.at(-1)?.kind).toBe("system");
  });
});

describe("SET_LIFE", () => {
  it("sets life within bounds", () => {
    const { game, ctx, ada } = setup();
    mustOk(act(game, ctx, ada, { type: "SET_LIFE", life: -3 }));
    expect(ada.life).toBe(-3);
    mustFail(act(game, ctx, ada, { type: "SET_LIFE", life: 1.5 }), "life");
  });
});

describe("LEAVE_GAME", () => {
  it("removes a leaving player and advances the turn if it was theirs", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    expect(game.activePlayerId).toBe(ada.id);
    mustOk(act(game, ctx, ada, { type: "LEAVE_GAME" }));
    expect(game.players.map((p) => p.id)).toEqual([bob.id]);
    expect(game.activePlayerId).toBe(bob.id);
  });

  it("transfers host to the next seated player when the host leaves", () => {
    const { game, ctx, ada, bob } = setup();
    expect(game.hostId).toBe(ada.id);
    mustOk(act(game, ctx, ada, { type: "LEAVE_GAME" }));
    expect(game.hostId).toBe(bob.id);
  });
});
