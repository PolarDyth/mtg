// Pure seating-policy predicates for the connection layer (ws.ts). Kept here —
// not in ws.ts — so they're unit-testable without a live WebSocketServer.

import type { Game } from "./engine/state";

/** Structural slice of ws.ts's Conn: everything seatStillHeld needs. */
type ConnLike = { game: unknown; playerId: string | null };

/** Case-insensitive display-name collision with a seated player (SEC-11):
 * joining with the host's exact name must not be a free impersonation vector.
 * A disconnected-but-unswept seat still holds its name until the lobby GC
 * removes it; rejoin is exempt (same player, proven by token). */
export function nameTaken(game: Game, name: string): boolean {
  const n = name.trim().toLowerCase();
  return game.players.some((p) => p.name.trim().toLowerCase() === n);
}

/** True when some OTHER connection still holds this seat (SEC-13): multi-tab
 * rejoin is allowed, so a close must not mark the seat disconnected — and
 * GC-eligible — while a live socket owns it. */
export function seatStillHeld(
  conns: Iterable<ConnLike>,
  exclude: ConnLike,
  playerId: string
): boolean {
  for (const c of conns) {
    if (c !== exclude && c.game === exclude.game && c.playerId === playerId) {
      return true;
    }
  }
  return false;
}
