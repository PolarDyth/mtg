// Room registry: game instances keyed by room code, with idle GC.
// Games live in RAM only — a server restart clears every room (accepted v1).

import type { Game } from "./engine/state";
import { createGame } from "./engine/state";
import type { Rng } from "./engine/rng";

const ROOM_IDLE_MS = 60 * 60 * 1000; // delete 1h after the last connection closes
const SWEEP_INTERVAL_MS = 60 * 1000;

const WORDS = [
  "PLAINS", "ISLAND", "SWAMP", "MOUNTAIN", "FOREST", "WASTE",
  "GOBLIN", "ELF", "MERFOLK", "ZOMBIE", "SPIRIT", "ANGEL",
  "DEMON", "DRAGON", "HYDRA", "KRAKEN", "SPHINX", "PHOENIX",
  "MAGIC", "RITUAL", "OMEN", "RUNE", "SIGIL", "RELIC",
  "EMBER", "FROST", "STORM", "TIDE", "ROOT", "THORN",
  "LANTERN", "BEACON", "TORCH", "CANDLE", "PRISM", "MIRROR",
  "RAVEN", "OWL", "WOLF", "BEAR", "STAG", "FOX",
  "FORGE", "ANVIL", "GRIMOIRE", "SCROLL", "TOME", "QUILL",
  "COMET", "ECLIPSE", "AURORA", "DUSK", "DAWN", "ZENITH",
  "CITADEL", "SANCTUM", "GROTTO", "SPIRE", "VAULT", "PORTAL",
  "BOLAS", "URZA", "YAWGMOTH", "SERRA", "KARPLUS", "TOLARIA",
];

export class RoomManager {
  private rooms = new Map<string, Game>();
  private lastActivity = new Map<string, number>();
  private sweeper: ReturnType<typeof setInterval> | null = null;
  /** Per-room sweep pass (set by ws.ts): player-level GC + re-broadcast. */
  onSweep: ((game: Game) => void) | null = null;

  constructor(private rng: Rng, private now: () => number = Date.now) {}

  create(creatorIp?: string): Game {
    let code = this.freshCode();
    while (this.rooms.has(code)) code = this.freshCode();
    const game = createGame(code);
    game.creatorIp = creatorIp; // server-private: caps rooms per network
    this.rooms.set(code, game);
    this.touch(code);
    return game;
  }

  count(): number {
    return this.rooms.size;
  }

  countByCreatorIp(ip: string): number {
    let n = 0;
    for (const game of this.rooms.values()) {
      if (game.creatorIp === ip) n += 1;
    }
    return n;
  }

  get(code: string): Game | undefined {
    return this.rooms.get(normalizeCode(code));
  }

  delete(code: string): void {
    this.rooms.delete(normalizeCode(code));
    this.lastActivity.delete(normalizeCode(code));
  }

  /** Record activity (a connection event) so GC doesn't collect a live room. */
  touch(code: string): void {
    this.lastActivity.set(normalizeCode(code), this.now());
  }

  /** Remove rooms whose last connection closed more than ROOM_IDLE_MS ago,
   *  then run the per-room sweep hook (player-level GC). A room the hook
   *  empties is torn down immediately, like the last LEAVE_GAME. */
  sweep(): number {
    const now = this.now();
    let removed = 0;
    for (const [code, game] of this.rooms) {
      const idle =
        game.players.length === 0 ||
        game.players.every((p) => !p.connected);
      const last = this.lastActivity.get(code) ?? 0;
      if (idle && now - last > ROOM_IDLE_MS) {
        this.rooms.delete(code);
        this.lastActivity.delete(code);
        removed += 1;
        continue;
      }
      this.onSweep?.(game);
      if (game.players.length === 0) {
        this.rooms.delete(code);
        this.lastActivity.delete(code);
        removed += 1;
      }
    }
    return removed;
  }

  startSweeping(): void {
    if (this.sweeper) return;
    this.sweeper = setInterval(() => {
      try {
        this.sweep();
      } catch (err) {
        // a bug in one pass must not kill the process hosting every room
        console.error("room sweep error:", err);
      }
    }, SWEEP_INTERVAL_MS);
    this.sweeper.unref();
  }

  // WORD-WORD-1234: 66² × 10⁴ ≈ 4.4 billion codes (~32 bits) — the room code
  // is the system's only access control, so the space must resist sweeping.
  private freshCode(): string {
    const w1 = WORDS[this.rng.int(WORDS.length)];
    const w2 = WORDS[this.rng.int(WORDS.length)];
    const number = this.rng.int(10000);
    return `${w1}-${w2}-${String(number).padStart(4, "0")}`;
  }
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export function isValidCode(code: string): boolean {
  return /^[A-Z]+-[A-Z]+-\d{4}$/.test(normalizeCode(code));
}
