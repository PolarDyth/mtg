// Shared contract between the game server and the browser client.
// Consumed as raw TypeScript: Next transpiles it via transpilePackages,
// tsx/tsc compile it directly on the server.

export type PlayerId = string;

export type Zone =
  | "library"
  | "hand"
  | "battlefield"
  | "graveyard"
  | "exile"
  | "command"
  | "sideboard";

export const ALL_ZONES: Zone[] = [
  "library",
  "hand",
  "battlefield",
  "graveyard",
  "exile",
  "command",
  "sideboard",
];

type CardBase = {
  uid: string;
  /** Battlefield position, percentages of the battlefield area (0–100). */
  x: number;
  y: number;
  tapped: boolean;
  faceDown: boolean;
  counters: Record<string, number>;
  annotations: string[];
  /** uid of the card this one is attached to (auras, equipment). */
  attachedTo?: string;
};

/** A physical card as the server stores it: identity always known. */
export type CardInstance = CardBase & { cardId: string };

/** A card as a client sees it: cardId is null when hidden (face-down). */
export type CardView = CardBase & { cardId: string | null };

export type DieSides = 4 | 6 | 8 | 10 | 12 | 20 | 100;

/** Game formats. They tweak starting setup, never enforce rules. */
export type Format = "freeform" | "commander";

export type DeckEntry = { cardId: string; count: number };

export type Action =
  | { type: "LOAD_DECK"; library: DeckEntry[]; sideboard: DeckEntry[] }
  | { type: "START_GAME"; format?: Format }
  | { type: "SET_COMMANDER"; cardId: string; name: string }
  | { type: "DRAW_CARDS"; count: number }
  | {
      type: "MOVE_CARD";
      uid: string;
      to: Zone;
      /** Target position: "top"/"bottom" library sentinels (race-safe) or a
       *  0-based index clamped to the zone length. Default: top of library,
       *  end of everything else. */
      index?: number | "top" | "bottom";
    }
  | { type: "MOVE_CARD_INDEX"; uid: string; index: number }
  | { type: "SET_TAPPED"; uid: string; value: boolean }
  | { type: "SET_FACE_DOWN"; uid: string; value: boolean }
  | { type: "SET_COUNTERS"; uid: string; counters: Record<string, number> }
  | { type: "SET_POSITION"; uid: string; x: number; y: number }
  | { type: "SET_NOTES"; uid: string; notes: string[] }
  | { type: "ATTACH_CARD"; uid: string; to: string | null }
  | { type: "CREATE_TOKEN"; name: string; cardId?: string; count: number }
  | { type: "REVEAL_CARDS"; cards: { uid: string; name: string }[] }
  | { type: "SHUFFLE_LIBRARY" }
  | { type: "DISCARD_CARDS"; uids: string[] }
  | { type: "MILL_CARDS"; count: number }
  /** `top` + `bottom` must exactly partition the top `min(look, library)`
   *  cards. The `top` group lands on top in array order; `bottom` goes to
   *  the bottom in array order. Cards below the window are untouched. */
  | { type: "SCRY"; look: number; top: string[]; bottom: string[] }
  /** Same partition contract as SCRY, but the second group goes to the
   *  graveyard (in array order). */
  | { type: "SURVEIL"; look: number; top: string[]; graveyard: string[] }
  | { type: "SET_LIFE"; life: number }
  | { type: "ROLL_DIE"; sides: number }
  | { type: "NEXT_TURN" }
  | { type: "SEND_CHAT"; text: string }
  | { type: "LEAVE_GAME" }
  | { type: "END_GAME" }
  | { type: "KICK_PLAYER"; playerId: PlayerId }
  | { type: "BAN_PLAYER"; playerId: PlayerId };

// --- Wire protocol -----------------------------------------------------------

export type ClientMessage =
  | { kind: "create"; name: string }
  | { kind: "join"; code: string; name: string }
  | { kind: "rejoin"; code: string; token: string }
  | { kind: "action"; action: Action };

export type ServerMessage =
  | { type: "welcome"; code: string; token: string; you: PlayerId }
  | { type: "snapshot"; state: GameView }
  | { type: "error"; message: string };

// --- Personalized snapshots --------------------------------------------------

export type ZoneView =
  | { kind: "cards"; cards: CardView[] }
  | { kind: "count"; count: number };

export type PlayerView = {
  id: PlayerId;
  name: string;
  life: number;
  connected: boolean;
  hasDeck: boolean;
  zones: Record<Zone, ZoneView>;
};

type ChatBase = { id: string; at: number; playerId: PlayerId };

export type ChatMessage =
  | (ChatBase & { kind: "text"; text: string })
  | (ChatBase & { kind: "dice"; sides: number; result: number })
  | (ChatBase & { kind: "reveal"; cards: { name: string; cardId: string }[] })
  | (ChatBase & { kind: "system"; text: string });

export type GameView = {
  code: string;
  started: boolean;
  format: Format;
  activePlayerId: PlayerId;
  /** Who runs host actions (end game, remove players). */
  hostId: PlayerId;
  players: PlayerView[];
  chat: ChatMessage[];
};

/** Max chat messages retained in state and sent in snapshots. */
export const CHAT_CAP = 200;

/** Max players per game. */
export const MAX_PLAYERS = 6;
