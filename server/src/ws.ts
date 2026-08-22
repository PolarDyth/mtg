// Game WebSocket server: connection lifecycle, join/create/rejoin, and the
// action pipeline. Every applied action re-broadcasts a personalized
// snapshot to each connection in the room.

import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import {
  MAX_PLAYERS,
  type Action,
  type ClientMessage,
  type ServerMessage,
} from "@mythic/shared";
import { applyAction, isBanned, type Ctx } from "./engine/actions";
import { sweepDisconnectedPlayers } from "./engine/gc";
import { systemRng, type Rng } from "./engine/rng";
import {
  addPlayer,
  makePlayer,
  systemMessage,
  type Game,
  type Player,
} from "./engine/state";
import { personalize } from "./engine/view";
import { HitWindow } from "./ratelimit";
import { RoomManager, isValidCode, normalizeCode } from "./rooms";

type Conn = {
  ws: WebSocket;
  game: Game | null;
  playerId: string | null;
  missedPings: number;
  /** pending "disconnected" announcement (cancelled by a quick rejoin) */
  announceTimer: ReturnType<typeof setTimeout> | null;
  /** failed join attempts — room-code sweeping gets the socket closed */
  joinFails: HitWindow;
  ip?: string;
};

const HEARTBEAT_MS = 30_000;
const DISCONNECT_ANNOUNCE_MS = 10_000;
const MAX_PAYLOAD = 64 * 1024;
const JOIN_FAIL_CONN_LIMIT = 5;
const JOIN_FAIL_CONN_MS = 10_000;
const JOIN_FAIL_IP_LIMIT = 10;
const JOIN_FAIL_IP_MS = 60_000;

const rng: Rng = systemRng();
const ctx: Ctx = { rng, now: () => Date.now() };
const rooms = new RoomManager(rng);
// lobby disconnect GC: drop stale unstarted-game seats, tell whoever's left
rooms.onSweep = (game) => {
  if (sweepDisconnectedPlayers(game, Date.now(), rng)) broadcast(game);
};
rooms.startSweeping();

const conns = new Set<Conn>();

// Failed joins per IP across all connections. Entries are pruned to zero (and
// deleted) on that IP's next join attempt, so the map only grows with the
// number of distinct misbehaving IPs.
const ipJoinFails = new Map<string, HitWindow>();

export function isGameUpgrade(req: IncomingMessage): boolean {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  return pathname === "/ws";
}

export function handleGameUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer
): void {
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
}

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });

// Detect silently-dead TCP connections (network drops without a FIN):
// ping every 30s and terminate after two missed responses.
const heartbeat = setInterval(() => {
  for (const conn of conns) {
    if (conn.missedPings >= 2) {
      conn.ws.terminate();
      continue;
    }
    conn.missedPings += 1;
    conn.ws.ping();
  }
}, HEARTBEAT_MS);
heartbeat.unref();

wss.on("connection", (ws, req) => {
  const conn: Conn = {
    ws,
    game: null,
    playerId: null,
    missedPings: 0,
    announceTimer: null,
    joinFails: new HitWindow(JOIN_FAIL_CONN_MS),
    ip: clientIp(req),
  };
  conns.add(conn);

  ws.on("pong", () => {
    conn.missedPings = 0;
  });

  ws.on("message", (data, isBinary) => {
    if (isBinary) return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      send(ws, { type: "error", message: "malformed message" });
      return;
    }
    try {
      if (!conn.playerId) {
        handleHello(conn, msg);
      } else if (msg.kind === "action") {
        handleAction(conn, msg.action);
      }
    } catch (err) {
      // a bug in one connection must not take down the process
      console.error("message handling error:", err);
      sendError(conn, "internal error — action ignored");
    }
  });

  ws.on("close", () => {
    conns.delete(conn);
    if (conn.announceTimer) {
      clearTimeout(conn.announceTimer);
      conn.announceTimer = null;
    }
    const game = conn.game;
    if (!game || !conn.playerId) return;
    const player = game.players.find((p) => p.id === conn.playerId);
    if (!player) return;

    player.connected = false;
    player.disconnectedAt = Date.now();
    // A refresh-and-rejoin within a few seconds shouldn't spam the chat:
    // announce the disconnect only if the seat stays gone.
    conn.announceTimer = setTimeout(() => {
      conn.announceTimer = null;
      player.disconnectedAnnounced = true;
      systemMessageNow(game, `${player.name} disconnected`);
      broadcast(game);
    }, DISCONNECT_ANNOUNCE_MS);
    conn.announceTimer.unref();

    broadcast(game);
    rooms.touch(game.code);
  });

  ws.on("error", () => {
    ws.terminate();
  });
});

function handleHello(conn: Conn, msg: ClientMessage): void {
  if (msg.kind === "create") {
    const name = cleanName(msg.name);
    if (!name) return sendError(conn, "pick a name first (1–24 characters)");
    const game = rooms.create();
    seat(conn, game, name);
    return;
  }
  if (msg.kind === "join") {
    if (ipJoinFailCount(conn.ip, Date.now()) >= JOIN_FAIL_IP_LIMIT) {
      return sendError(conn, "too many join attempts — wait a minute");
    }
    const code = normalizeCode(msg.code ?? "");
    if (!isValidCode(code)) return failJoin(conn, "that room code doesn't look right");
    const game = rooms.get(code);
    if (!game) return failJoin(conn, "room not found");
    if (game.players.length >= MAX_PLAYERS) {
      return failJoin(conn, "room is full (6 players max)");
    }
    const name = cleanName(msg.name);
    if (!name) return failJoin(conn, "pick a name first (1–24 characters)");
    if (isBanned(game, name, conn.ip)) {
      return failJoin(conn, "you are banned from this table");
    }
    seat(conn, game, name);
    return;
  }
  if (msg.kind === "rejoin") {
    const code = normalizeCode(msg.code ?? "");
    const game = rooms.get(code);
    if (!game) return sendError(conn, "room not found — it may have expired");
    const player = game.players.find(
      (p) => p.token === msg.token && p.token.length > 0
    );
    if (!player) return sendError(conn, "seat not found for that token");
    conn.game = game;
    conn.playerId = player.id;
    player.connected = true;
    player.disconnectedAt = undefined;
    rooms.touch(code);
    if (player.disconnectedAnnounced) {
      player.disconnectedAnnounced = false;
      systemMessageNow(game, `${player.name} reconnected`);
    }
    send(conn.ws, {
      type: "welcome",
      code: game.code,
      token: player.token,
      you: player.id,
    });
    broadcast(game);
    return;
  }
  sendError(conn, "say hello first (create / join / rejoin)");
}

function seat(conn: Conn, game: Game, name: string): void {
  const player: Player = makePlayer(game, name, randomUUID(), rng);
  player.ip = conn.ip;
  conn.joinFails.reset();
  addPlayer(game, player); // first player seated becomes the host
  conn.game = game;
  conn.playerId = player.id;
  rooms.touch(game.code);
  systemMessageNow(game, `${name} joined`);
  send(conn.ws, {
    type: "welcome",
    code: game.code,
    token: player.token,
    you: player.id,
  });
  broadcast(game);
}

function handleAction(conn: Conn, action: Action): void {
  const game = conn.game;
  if (!game || !conn.playerId) return;
  const result = applyAction(game, action, conn.playerId, ctx);
  if (result.ok) {
    broadcast(game);
    if (game.players.length === 0) {
      // last player left — tear the room down immediately
      for (const c of conns) {
        if (c.game === game) c.ws.close();
      }
      rooms.delete(game.code);
    } else if (action.type === "KICK_PLAYER" || action.type === "BAN_PLAYER") {
      // drop the removed player's connections so they land on the fatal screen
      const verb = action.type === "BAN_PLAYER" ? "banned" : "removed";
      for (const c of conns) {
        if (c.game === game && c.playerId === action.playerId) {
          send(c.ws, {
            type: "error",
            message: `You were ${verb} from the game by the host`,
          });
          c.ws.close();
        }
      }
    }
  } else {
    sendError(conn, result.error);
  }
}

function broadcast(game: Game): void {
  for (const conn of conns) {
    if (conn.game !== game || !conn.playerId) continue;
    send(conn.ws, { type: "snapshot", state: personalize(game, conn.playerId) });
  }
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function sendError(conn: Conn, message: string): void {
  send(conn.ws, { type: "error", message });
}

function systemMessageNow(game: Game, text: string): void {
  systemMessage(game, text, rng, Date.now());
}

function cleanName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, 24);
}

/** Live failed-join count for an IP (prunes the entry when it hits zero). */
function ipJoinFailCount(ip: string | undefined, now: number): number {
  if (!ip) return 0;
  const w = ipJoinFails.get(ip);
  if (!w) return 0;
  const n = w.count(now);
  if (n === 0) ipJoinFails.delete(ip);
  return n;
}

/** A failed join attempt: reply with the reason, and when the connection has
 *  burned through its failure budget (code-sweeping), close it outright. */
function failJoin(conn: Conn, message: string): void {
  const now = Date.now();
  conn.joinFails.hit(now);
  if (conn.ip) {
    let w = ipJoinFails.get(conn.ip);
    if (!w) {
      w = new HitWindow(JOIN_FAIL_IP_MS);
      ipJoinFails.set(conn.ip, w);
    }
    w.hit(now);
  }
  sendError(conn, message);
  if (conn.joinFails.count(now) > JOIN_FAIL_CONN_LIMIT) {
    conn.ws.close(1008, "too many failed join attempts");
  }
}

/** Client IP: first hop of X-Forwarded-For when behind a proxy, else the socket. */
function clientIp(req: IncomingMessage): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? undefined;
}
