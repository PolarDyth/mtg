// Server-side game state. The Game/Player types here are private to the
// server: they contain secrets (rejoin tokens) and true card identities that
// view.ts filters before anything reaches a client.

import { ALL_ZONES, CHAT_CAP, type CardInstance, type ChatMessage, type Format, type PlayerId, type Zone } from "@mythic/shared";
import type { Rng } from "./rng";

export type Player = {
  id: PlayerId;
  name: string;
  /** Secret used to reattach a seat after a disconnect. */
  token: string;
  connected: boolean;
  /** True once a disconnect has been announced in chat (rejoin stays quiet otherwise). */
  disconnectedAnnounced?: boolean;
  life: number;
  zones: Record<Zone, CardInstance[]>;
  hasDeck: boolean;
};

export type Game = {
  code: string;
  started: boolean;
  format: Format;
  activePlayerId: PlayerId | null;
  players: Player[];
  chat: ChatMessage[];
};

export function emptyZones(): Record<Zone, CardInstance[]> {
  const zones = {} as Record<Zone, CardInstance[]>;
  for (const zone of ALL_ZONES) zones[zone] = [];
  return zones;
}

export function randomId(rng: Rng): string {
  return Array.from({ length: 16 }, () =>
    Math.floor(rng.float() * 16).toString(16)
  ).join("");
}

export function createGame(code: string): Game {
  return {
    code,
    started: false,
    format: "freeform",
    activePlayerId: null,
    players: [],
    chat: [],
  };
}

export function addPlayer(game: Game, player: Player): void {
  game.players.push(player);
}

export function makePlayer(
  game: Game,
  name: string,
  token: string,
  rng: Rng
): Player {
  return {
    id: randomId(rng),
    name,
    token,
    connected: true,
    life: 20,
    zones: emptyZones(),
    hasDeck: false,
  };
}

export function findPlayer(game: Game, id: PlayerId): Player | undefined {
  return game.players.find((p) => p.id === id);
}

/** Locate a card and the player who owns it (whose zone contains it). */
export function findCard(
  game: Game,
  uid: string
): { player: Player; card: CardInstance } | undefined {
  for (const player of game.players) {
    for (const zone of ALL_ZONES) {
      const card = player.zones[zone].find((c) => c.uid === uid);
      if (card) return { player, card };
    }
  }
  return undefined;
}

export function chatId(rng: Rng): string {
  return randomId(rng);
}

/** Append a chat message, keeping the buffer capped. */
export function pushChat(game: Game, message: ChatMessage): void {
  game.chat.push(message);
  if (game.chat.length > CHAT_CAP) {
    game.chat.splice(0, game.chat.length - CHAT_CAP);
  }
}

export function systemMessage(game: Game, text: string, rng: Rng, at: number): void {
  pushChat(game, { id: chatId(rng), at, playerId: "", kind: "system", text });
}

/** Token labels live in annotations with this marker; note edits keep them. */
export const TOKEN_MARKER = "¶";
