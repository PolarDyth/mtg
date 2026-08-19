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
import { applyAction, type Ctx } from "./engine/actions";
import { systemRng, type Rng } from "./engine/rng";
import {
  makePlayer,
  systemMessage,
  type Game,
  type Player,
} from "./engine/state";
import { personalize } from "./engine/view";
import { RoomManager, isValidCode, normalizeCode } from "./rooms";

type Conn = {
  ws: WebSocket;
  game: Game | null;
  playerId: string | null;
};

const rng: Rng = systemRng();
const ctx: Ctx = { rng, now: () => Date.now() };
const rooms = new RoomManager(rng);
rooms.startSweeping();

const conns = new Set<Conn>();

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

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws) => {
  const conn: Conn = { ws, game: null, playerId: null };
  conns.add(conn);

  ws.on("message", (data, isBinary) => {
    if (isBinary) return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      send(ws, { type: "error", message: "malformed message" });
      return;
    }
    if (!conn.playerId) {
      handleHello(conn, msg);
    } else if (msg.kind === "action") {
      handleAction(conn, msg.action);
    }
  });

  ws.on("close", () => {
    conns.delete(conn);
    const game = conn.game;
    if (game && conn.playerId) {
      const player = game.players.find((p) => p.id === conn.playerId);
      if (player) {
        player.connected = false;
        systemMessageNow(game, `${player.name} disconnected`);
        broadcast(game);
        rooms.touch(game.code);
      }
    }
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
    const code = normalizeCode(msg.code ?? "");
    if (!isValidCode(code)) return sendError(conn, "that room code doesn't look right");
    const game = rooms.get(code);
    if (!game) return sendError(conn, "room not found");
    if (game.players.length >= MAX_PLAYERS) {
      return sendError(conn, "room is full (6 players max)");
    }
    const name = cleanName(msg.name);
    if (!name) return sendError(conn, "pick a name first (1–24 characters)");
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
    rooms.touch(code);
    systemMessageNow(game, `${player.name} reconnected`);
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
  game.players.push(player);
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
