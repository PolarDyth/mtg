// Lobby disconnect GC: a seat whose tab closed (no LEAVE_GAME) would linger
// as "offline" until the room-level idle GC. While the game has NOT started,
// drop players who have been disconnected past a short window — mid-game,
// disconnects keep the full rejoin protection instead.

import type { Rng } from "./rng";
import { removePlayer, systemMessage, type Game, type Player } from "./state";

export const LOBBY_DISCONNECT_MS = 2 * 60 * 1000;

/** True when the player's disconnect has outlived the lobby window. */
function stale(player: Player, now: number): boolean {
  return (
    !player.connected &&
    player.disconnectedAt !== undefined &&
    now - player.disconnectedAt >= LOBBY_DISCONNECT_MS
  );
}

/**
 * Remove players disconnected past LOBBY_DISCONNECT_MS — but only before the
 * game starts; once started, seats survive until the room-level idle GC so a
 * reconnect can pick them back up. Announces each removal in chat. Returns
 * whether anything changed (so the caller can re-broadcast).
 */
export function sweepDisconnectedPlayers(game: Game, now: number, rng: Rng): boolean {
  if (game.started) return false;
  let removed = false;
  for (const player of [...game.players]) {
    if (!stale(player, now)) continue;
    removePlayer(game, player.id); // transfers host/active player if it was them
    systemMessage(game, `${player.name} left the game (disconnected in lobby)`, rng, now);
    removed = true;
  }
  return removed;
}
