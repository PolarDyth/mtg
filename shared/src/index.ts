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

/** Turn phases — shared LABELS for the phase strip. The server only syncs
 *  which one is current; it never enforces order or timing. */
export type Phase =
  | "untap"
  | "upkeep"
  | "draw"
  | "main1"
  | "startCombat"
  | "attackers"
  | "blockers"
  | "damage"
  | "endCombat"
  | "main2"
  | "end";

export const ALL_PHASES: Phase[] = [
  "untap",
  "upkeep",
  "draw",
  "main1",
  "startCombat",
  "attackers",
  "blockers",
  "damage",
  "endCombat",
  "main2",
  "end",
];

type CardBase = {
  uid: string;
  /** Battlefield position, percentages of the battlefield area (0–100). */
  x: number;
  y: number;
  tapped: boolean;
  faceDown: boolean;
  /** Double-faced cards: the back face is showing. Public — transform is
   *  table knowledge; the def (same cardId both faces) carries the art. */
  showBack?: boolean;
  counters: Record<string, number>;
  annotations: string[];
  /** uid of the card this one is attached to (auras, equipment). */
  attachedTo?: string;
};

/** A physical card as the server stores it: identity always known. */
export type CardInstance = CardBase & { cardId: string };

/** A card as a client sees it: cardId is null when hidden (face-down). */
export type CardView = CardBase & { cardId: string | null };

/** Where an arrow points: another battlefield card, or a player's board. */
export type ArrowTarget = { uid: string } | { playerId: PlayerId };

/**
 * A drawn arrow on the battlefield — attack/block/target declarations in the
 * Cockatrice style. Fully public (battlefield uids are visible to every
 * viewer). Arrows clear when the turn passes, when an endpoint leaves play,
 * or on demand.
 */
export type Arrow = {
  id: string;
  /** Author; arrows render in the author's color. */
  playerId: PlayerId;
  /** Source battlefield card (any player's). */
  fromUid: string;
  to: ArrowTarget;
  at: number;
};

export type DieSides = 4 | 6 | 8 | 10 | 12 | 20 | 100;

/** Game formats. They tweak starting setup, never enforce rules. */
export type Format = "freeform" | "commander";

export type DeckEntry = { cardId: string; count: number };

/** The six mana colors a pool tracks: W/U/B/R/G plus colorless. */
export const MANA_COLORS = ["W", "U", "B", "R", "G", "C"] as const;
export type ManaColor = (typeof MANA_COLORS)[number];
export type ManaPool = Record<ManaColor, number>;

/** An all-zero pool — the starting state, the END_GAME reset, and the
 *  client's "clear pool" button. */
export function emptyMana(): ManaPool {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

export type Action =
  | { type: "LOAD_DECK"; library: DeckEntry[]; sideboard: DeckEntry[] }
  | { type: "START_GAME"; format?: Format }
  | { type: "SET_COMMANDER"; cardId: string; name: string }
  | { type: "DRAW_CARDS"; count: number }
  /** Shuffle your whole hand into your library, then draw `draw` cards. */
  | { type: "MULLIGAN"; draw: number }
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
  /** Toggle which face of a double-faced card is showing. The client
   *  supplies the target face's display name (the server is card-id
   *  agnostic) for the chat line; counters, position, and attachments
   *  ride along untouched. */
  | { type: "TRANSFORM_CARD"; uid: string; name: string }
  | { type: "SET_COUNTERS"; uid: string; counters: Record<string, number> }
  | { type: "SET_POSITION"; uid: string; x: number; y: number }
  | { type: "SET_NOTES"; uid: string; notes: string[] }
  | { type: "ATTACH_CARD"; uid: string; to: string | null }
  | { type: "CREATE_TOKEN"; name: string; cardId?: string; count: number }
  | { type: "DRAW_ARROW"; fromUid: string; to: ArrowTarget }
  /** Remove arrows: one by `id`, one author's by `playerId`, or all. */
  | { type: "CLEAR_ARROWS"; id?: string; playerId?: PlayerId }
  | {
      type: "REVEAL_CARDS";
      cards: { uid: string; name: string }[];
      /** Audience: absent = whole table; present = only these seated players
       * (plus the revealer) ever see the message. */
      to?: PlayerId[];
    }
  | { type: "SHUFFLE_LIBRARY" }
  | { type: "DISCARD_CARDS"; uids: string[] }
  /** The SERVER picks `count` random cards from the actor's hand — randomness
   *  is server-side (Ctx.rng) so the whole table can trust the roll. */
  | { type: "DISCARD_RANDOM"; count: number }
  | { type: "MILL_CARDS"; count: number }
  /** `top` + `bottom` must exactly partition the top `min(look, library)`
   *  cards. The `top` group lands on top in array order; `bottom` goes to
   *  the bottom in array order. Cards below the window are untouched. */
  | { type: "SCRY"; look: number; top: string[]; bottom: string[] }
  /** Same partition contract as SCRY, but the second group goes to the
   *  graveyard (in array order). */
  | { type: "SURVEIL"; look: number; top: string[]; graveyard: string[] }
  | { type: "SET_LIFE"; life: number }
  /** Whole-record mana pool commit (like SET_LIFE): the client sends the
   *  complete pool it wants; missing colors default to zero. Public state —
   *  everyone sees every pool, and nothing auto-empties it. */
  | { type: "SET_MANA"; mana: Partial<ManaPool> }
  | { type: "ROLL_DIE"; sides: number }
  | { type: "SET_PHASE"; phase: Phase }
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
  /** Public mana pool — visible to every viewer, like life. */
  mana: ManaPool;
  connected: boolean;
  hasDeck: boolean;
  zones: Record<Zone, ZoneView>;
};

type ChatBase = { id: string; at: number; playerId: PlayerId };

export type ChatMessage =
  | (ChatBase & { kind: "text"; text: string })
  | (ChatBase & { kind: "dice"; sides: number; result: number })
  | (ChatBase & {
      kind: "reveal";
      cards: { name: string; cardId: string }[];
      /** Present when the reveal targets specific players: only they (and the
       * revealer) receive this message in their snapshot. */
      to?: PlayerId[];
    })
  | (ChatBase & { kind: "system"; text: string });

export type GameView = {
  code: string;
  started: boolean;
  format: Format;
  /** Current turn phase — a shared label, identical for every viewer. */
  phase: Phase;
  /** Turn counter — 1 from game start, +1 per NEXT_TURN. Shared label. */
  turnNumber: number;
  /** Game-start timestamp (epoch ms) for elapsed clocks; null in the lobby.
   *  Clients tick their own clock against it; the server never ticks. */
  startedAt: number | null;
  activePlayerId: PlayerId;
  /** Who runs host actions (end game, remove players). */
  hostId: PlayerId;
  players: PlayerView[];
  chat: ChatMessage[];
  /** Drawn arrows — public, identical for every viewer. */
  arrows: Arrow[];
};

/** Max chat messages retained in state and sent in snapshots. */
export const CHAT_CAP = 200;

/** Max players per game. */
export const MAX_PLAYERS = 6;
