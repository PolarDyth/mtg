// Game-flow tests: START_GAME, NEXT_TURN, SET_PHASE, SET_LIFE, LEAVE_GAME.

import type { Phase } from "@mythic/shared";
import { describe, expect, it } from "vitest";
import { act, mustFail, mustOk, setup, startWithDeck, uidAt } from "./testUtils";

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

  it("counts turns from 1 and stamps the game clock at start", () => {
    const { game, ctx, ada, bob } = setup();
    expect(game.turnNumber).toBe(0);
    expect(game.startedAt).toBeNull();
    startWithDeck(game, ctx, ada);
    expect(game.turnNumber).toBe(1);
    expect(game.startedAt).toBe(1_000); // ctx.now() from the harness
    mustOk(act(game, ctx, bob, { type: "NEXT_TURN" }));
    mustOk(act(game, ctx, ada, { type: "NEXT_TURN" }));
    expect(game.turnNumber).toBe(3);
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

  it("auto-draws opening hands for decked players only", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    expect(ada.zones.hand).toHaveLength(7);
    expect(ada.zones.library).toHaveLength(33);
    expect(bob.zones.hand).toHaveLength(0); // no deck, no draw
    const texts = game.chat.map((m) => (m.kind === "system" ? m.text : ""));
    expect(texts).toContain("Opening hands drawn");
  });

  it("clamps the opening hand to a short library", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 3);
    expect(ada.zones.hand).toHaveLength(3);
    expect(ada.zones.library).toHaveLength(0);
  });
});

describe("MULLIGAN", () => {
  it("shuffles the hand away and deals the chosen size", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada); // hand 7 / library 33
    mustOk(act(game, ctx, ada, { type: "MULLIGAN", draw: 6 }));
    expect(ada.zones.hand).toHaveLength(6);
    expect(ada.zones.library).toHaveLength(34);
    const last = game.chat.at(-1);
    if (last?.kind !== "system") throw new Error("expected system message");
    expect(last.text).toContain("mulligan to 6");
  });

  it("clamps the draw to what the library can give back", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 10); // hand 7 / library 3
    mustOk(act(game, ctx, ada, { type: "MULLIGAN", draw: 99 }));
    expect(ada.zones.hand).toHaveLength(10);
    expect(ada.zones.library).toHaveLength(0);
  });

  it("rejects junk sizes and pre-game mulligans", () => {
    const { game, ctx, ada } = setup();
    mustFail(act(game, ctx, ada, { type: "MULLIGAN", draw: 7 }), "not started");
    startWithDeck(game, ctx, ada);
    mustFail(act(game, ctx, ada, { type: "MULLIGAN", draw: -1 }), "bad mulligan size");
    mustFail(act(game, ctx, ada, { type: "MULLIGAN", draw: 1.5 }), "bad mulligan size");
    mustFail(act(game, ctx, ada, { type: "MULLIGAN", draw: 100 }), "bad mulligan size");
  });
});

describe("SET_PHASE", () => {
  it("sets any valid phase from any seated player", () => {
    const { game, ctx, ada, bob } = setup();
    mustFail(act(game, ctx, ada, { type: "SET_PHASE", phase: "main1" }), "not started");
    startWithDeck(game, ctx, ada);
    // bob isn't the active player — still allowed (like NEXT_TURN, no gating)
    mustOk(act(game, ctx, bob, { type: "SET_PHASE", phase: "main1" }));
    expect(game.phase).toBe("main1");
  });

  it("rejects unknown phases", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada);
    mustFail(
      act(game, ctx, ada, {
        type: "SET_PHASE",
        phase: "midcombat" as unknown as Phase,
      }),
      "unknown phase"
    );
  });
});

describe("NEXT_TURN phases", () => {
  it("untaps the incoming player, resets the phase, and clears arrows", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    const uid = uidAt(ada.zones.hand, 0);
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid, to: "battlefield" }));
    mustOk(act(game, ctx, ada, { type: "SET_TAPPED", uid, value: true }));
    mustOk(act(game, ctx, ada, { type: "SET_PHASE", phase: "end" }));
    mustOk(
      act(game, ctx, ada, { type: "DRAW_ARROW", fromUid: uid, to: { playerId: bob.id } })
    );
    expect(game.arrows).toHaveLength(1);

    mustOk(act(game, ctx, ada, { type: "NEXT_TURN" })); // -> bob
    expect(game.activePlayerId).toBe(bob.id);
    expect(game.phase).toBe("untap");
    expect(game.arrows).toHaveLength(0);

    mustOk(act(game, ctx, ada, { type: "NEXT_TURN" })); // -> back to ada
    expect(game.activePlayerId).toBe(ada.id);
    expect(ada.zones.battlefield[0]?.tapped).toBe(false);
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

describe("SET_MANA", () => {
  it("commits the whole pool and defaults missing colors to zero", () => {
    const { game, ctx, ada } = setup();
    mustOk(act(game, ctx, ada, { type: "SET_MANA", mana: { G: 3, R: 1 } }));
    expect(ada.mana).toEqual({ W: 0, U: 0, B: 0, R: 1, G: 3, C: 0 });
    // whole-record semantics: a partial payload replaces the rest
    mustOk(act(game, ctx, ada, { type: "SET_MANA", mana: { C: 2 } }));
    expect(ada.mana).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 });
  });

  it("rejects unknown colors and bad amounts", () => {
    const { game, ctx, ada } = setup();
    mustFail(
      act(game, ctx, ada, {
        type: "SET_MANA",
        mana: { X: 1 } as unknown as { G: number },
      }),
      "mana color"
    );
    mustFail(act(game, ctx, ada, { type: "SET_MANA", mana: { G: -1 } }), "mana amount");
    mustFail(act(game, ctx, ada, { type: "SET_MANA", mana: { G: 100 } }), "mana amount");
    mustFail(act(game, ctx, ada, { type: "SET_MANA", mana: { G: 1.5 } }), "mana amount");
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
