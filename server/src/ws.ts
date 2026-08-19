// Game WebSocket server, mounted on the same HTTP server as Next.js.
// M1: echo. M2 replaces this with rooms, join/rejoin, and snapshots.

import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws) => {
  ws.on("message", (data, isBinary) => {
    if (!isBinary) ws.send(data);
  });
});

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
