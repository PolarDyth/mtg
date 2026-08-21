// Lobby disconnect GC (issue #26): stale seats vanish before the game starts;
// mid-game disconnects keep full rejoin protection.

import { describe, expect, it } from "vitest";
import { seededRng } from "./rng";
import type { Player } from "./state";
import { LOBBY_DISCONNECT_MS, sweepDisconnectedPlayers } from "./gc";
import { setup } from "./actions/testUtils";

const NOW = 1_000_000;

function disconnect(player: Player, agoMs: number): void {
  player.connected = false;
  player.disconnectedAt = NOW - agoMs;
}

describe("sweepDisconnectedPlayers", () => {
  it("removes a player disconnected past the lobby window", () => {
    const { game, ada, bob } = setup();
    disconnect(ada, LOBBY_DISCONNECT_MS + 60_000);

    const changed = sweepDisconnectedPlayers(game, NOW, seededRng(7));

    expect(changed).toBe(true);
    expect(game.players.map((p) => p.name)).toEqual(["Bob"]);
    expect(game.hostId).toBe(bob.id); // host transferred off the removed seat
    const last = game.chat[game.chat.length - 1];
    if (last?.kind === "system") {
      expect(last.text).toContain("Ada left the game (disconnected in lobby)");
    } else {
      throw new Error("expected a system chat line");
    }
  });

  it("keeps a player disconnected for less than the window", () => {
    const { game, ada } = setup();
    disconnect(ada, LOBBY_DISCONNECT_MS - 60_000);

    expect(sweepDisconnectedPlayers(game, NOW, seededRng(7))).toBe(false);
    expect(game.players).toHaveLength(2);
  });

  it("never removes seats once the game has started", () => {
    const { game, ada } = setup();
    game.started = true;
    disconnect(ada, 60 * 60 * 1000); // an hour — rejoin protection territory

    expect(sweepDisconnectedPlayers(game, NOW, seededRng(7))).toBe(false);
    expect(game.players).toHaveLength(2);
  });

  it("keeps disconnected players without a stamp (never left a connection)", () => {
    const { game, ada } = setup();
    ada.connected = false;

    expect(sweepDisconnectedPlayers(game, NOW, seededRng(7))).toBe(false);
    expect(game.players).toHaveLength(2);
  });

  it("empties the game when every seat was stale", () => {
    const { game, ada, bob } = setup();
    disconnect(ada, LOBBY_DISCONNECT_MS);
    disconnect(bob, LOBBY_DISCONNECT_MS);

    expect(sweepDisconnectedPlayers(game, NOW, seededRng(7))).toBe(true);
    expect(game.players).toEqual([]);
    expect(game.hostId).toBeNull();
  });
});
