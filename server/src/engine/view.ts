// Personalized snapshots: the server knows everything; each player is sent
// a filtered view. Hidden zones of opponents collapse to counts, and
// face-down cards lose their cardId for everyone except the owner.

import {
  ALL_ZONES,
  type CardInstance,
  type CardView,
  type GameView,
  type PlayerId,
  type PlayerView,
  type ZoneView,
} from "@mythic/shared";
import type { Game, Player } from "./state";
import { TOKEN_MARKER } from "./state";

const HIDDEN_ZONES = new Set(["hand", "library", "sideboard"]);

export function personalize(game: Game, viewerId: PlayerId): GameView {
  return {
    code: game.code,
    started: game.started,
    format: game.format,
    activePlayerId: game.activePlayerId ?? "",
    hostId: game.hostId ?? "",
    players: game.players.map((player) => playerView(player, viewerId)),
    chat: game.chat,
  };
}

function playerView(player: Player, viewerId: PlayerId): PlayerView {
  const isSelf = player.id === viewerId;
  const zones = {} as Record<string, ZoneView>;
  for (const zone of ALL_ZONES) {
    const cards = player.zones[zone];
    if (!isSelf && HIDDEN_ZONES.has(zone)) {
      zones[zone] = { kind: "count", count: cards.length };
    } else {
      zones[zone] = { kind: "cards", cards: cards.map((c) => cardView(c, isSelf)) };
    }
  }
  return {
    id: player.id,
    name: player.name,
    life: player.life,
    connected: player.connected,
    hasDeck: player.hasDeck,
    zones,
  };
}

function cardView(card: CardInstance, ownerIsViewer: boolean): CardView {
  const annotations = card.annotations.map((a) =>
    a.startsWith(TOKEN_MARKER) ? a.slice(TOKEN_MARKER.length) : a
  );
  if (!card.faceDown || ownerIsViewer) {
    return { ...card, counters: { ...card.counters }, annotations };
  }
  return {
    ...card,
    cardId: null,
    counters: { ...card.counters },
    annotations,
  };
}
