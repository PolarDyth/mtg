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

/** A physical copy of a card in a zone. */
export type CardInstance = {
  uid: string;
  /** Scryfall card id; null in a view means "hidden from you" (face-down). */
  cardId: string | null;
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

export type DieSides = 4 | 6 | 8 | 10 | 12 | 20 | 100;

export type DeckEntry = { cardId: string; count: number };

export type Action =
  | { type: "LOAD_DECK"; library: DeckEntry[]; sideboard: DeckEntry[] }
  | { type: "START_GAME" }
  | { type: "DRAW_CARDS"; count: number }
  | { type: "MOVE_CARD"; uid: string; to: Zone; index?: number }
  | { type: "MOVE_CARD_INDEX"; uid: string; index: number }
  | { type: "SET_TAPPED"; uid: string; value: boolean }
  | { type: "SET_FACE_DOWN"; uid: string; value: boolean }
  | { type: "SET_COUNTERS"; uid: string; counters: Record<string, number> }
  | { type: "SET_POSITION"; uid: string; x: number; y: number }
  | { type: "ATTACH_CARD"; uid: string; to: string | null }
  | { type: "CREATE_TOKEN"; name: string; cardId?: string; count: number }
  | { type: "REVEAL_CARDS"; uids: string[] }
  | { type: "SHUFFLE_LIBRARY" }
  | { type: "SET_LIFE"; life: number }
  | { type: "ROLL_DIE"; sides: DieSides }
  | { type: "NEXT_TURN" }
  | { type: "SEND_CHAT"; text: string }
  | { type: "LEAVE_GAME" };

// --- Wire protocol -----------------------------------------------------------

export type ClientMessage =
  | { kind: "join"; code: string; name: string }
  | { kind: "rejoin"; code: string; token: string }
  | { type: "action"; action: Action };

export type ServerMessage =
  | { type: "welcome"; token: string; you: PlayerId }
  | { type: "snapshot"; state: GameView }
  | { type: "error"; message: string };

// --- Personalized snapshots --------------------------------------------------

export type ZoneView =
  | { kind: "cards"; cards: CardInstance[] }
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
  activePlayerId: PlayerId;
  players: PlayerView[];
  chat: ChatMessage[];
};

/** Max chat messages retained in state and sent in snapshots. */
export const CHAT_CAP = 200;
