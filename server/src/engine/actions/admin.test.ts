// Host-power tests: END_GAME, KICK_PLAYER, BAN_PLAYER, isBanned.

import { describe, expect, it } from "vitest";
import { isBanned } from "./admin";
import { act, mustFail, mustOk, setup, startWithDeck } from "./testUtils";

describe("END_GAME and KICK_PLAYER", () => {
  it("host can end the game: back to lobby, table cleared, life reset", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 7 }));
    mustOk(act(game, ctx, ada, { type: "SET_LIFE", life: 13 }));
    mustOk(act(game, ctx, ada, { type: "SET_MANA", mana: { G: 4 } }));
    mustOk(act(game, ctx, ada, { type: "END_GAME" }));
    expect(game.started).toBe(false);
    expect(game.format).toBe("freeform");
    expect(game.activePlayerId).toBeNull();
    expect(game.turnNumber).toBe(0);
    expect(game.startedAt).toBeNull();
    for (const player of [ada, bob]) {
      expect(player.life).toBe(20);
      expect(player.mana).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });
      expect(player.hasDeck).toBe(false);
      expect(Object.values(player.zones).every((z) => z.length === 0)).toBe(true);
    }
    expect(game.chat.at(-1)?.kind).toBe("system");
  });

  it("non-hosts cannot end the game", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    mustFail(act(game, ctx, bob, { type: "END_GAME" }), "only the host");
  });

  it("host can kick a player; their cards leave with them", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    mustOk(act(game, ctx, bob, { type: "LOAD_DECK", library: [{ cardId: "b1", count: 5 }], sideboard: [] }));
    mustOk(act(game, ctx, bob, { type: "DRAW_CARDS", count: 2 }));
    mustOk(act(game, ctx, ada, { type: "KICK_PLAYER", playerId: bob.id }));
    expect(game.players.map((p) => p.id)).toEqual([ada.id]);
    expect(game.chat.at(-1)?.kind).toBe("system");
  });

  it("kicks are host-only and you cannot kick yourself", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    mustFail(act(game, ctx, bob, { type: "KICK_PLAYER", playerId: ada.id }), "only the host");
    mustFail(act(game, ctx, ada, { type: "KICK_PLAYER", playerId: ada.id }), "yourself");
  });

  it("banning removes the player and blocks their name and IP from rejoining", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    bob.ip = "203.0.113.7";
    mustOk(act(game, ctx, ada, { type: "BAN_PLAYER", playerId: bob.id }));
    expect(game.players.map((p) => p.id)).toEqual([ada.id]);
    expect(game.banned.names).toContain("bob");
    expect(game.banned.ips).toContain("203.0.113.7");
    expect(isBanned(game, "Bob")).toBe(true);
    expect(isBanned(game, "someone else", "203.0.113.7")).toBe(true);
    expect(isBanned(game, "someone else", "198.51.100.9")).toBe(false);
  });

  it("bans are host-only", () => {
    const { game, ctx, ada, bob } = setup();
    mustFail(act(game, ctx, bob, { type: "BAN_PLAYER", playerId: ada.id }), "only the host");
  });
});
