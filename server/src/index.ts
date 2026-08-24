// Mythic Table entry point: one Node process serving both the Next.js app
// and the game WebSocket server, on a single port.
//
// In dev, `tsx watch src/index.ts` boots Next in dev mode (Turbopack) through
// this custom server; in production `node dist/index.js` serves the build
// output from frontend/.next. The frontend directory is resolved relative to
// this file so both layouts work.

import { createServer } from "node:http";
import path from "node:path";
import next from "next";
import { sanitizeRequestUrl } from "./netguard";
import { handleGameUpgrade, isGameUpgrade } from "./ws";

const frontendDir = path.resolve(__dirname, "../../frontend");

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
// Default to loopback so dev mode (source, stack traces, HMR) never leaks to
// the LAN; the Docker image sets HOST=0.0.0.0 (required for the port mapping).
const host = process.env.HOST ?? "127.0.0.1";

// Last-resort crash backstop: this one process hosts every room, so a throw
// from an unguarded callback must degrade to a log line, not a process exit.
// (Callbacks that can throw are individually wrapped in ws.ts — these catch
// whatever a future edit forgets to guard.)
process.on("uncaughtException", (err) => {
  console.error("uncaught exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("unhandled rejection:", reason);
});

async function main(): Promise<void> {
  const app = next({ dev, dir: frontendDir });
  const handle = app.getRequestHandler();

  await app.prepare();

  const server = createServer((req, res) => {
    // /game/%ZZ would otherwise 500 deep inside Next's production router —
    // canonicalize it to /game/%25ZZ so it renders "bad room code" instead
    req.url = sanitizeRequestUrl(req.url ?? "/");
    handle(req, res).catch((err: unknown) => {
      console.error("request handler error:", err);
      res.statusCode = 500;
      res.end("internal server error");
    });
  });

  // Route WebSocket upgrades by path: /ws belongs to the game server,
  // everything else (notably Next's dev-mode HMR socket) goes to Next's own
  // upgrade handler.
  const nextUpgrade = app.getUpgradeHandler();
  server.on("upgrade", (req, socket, head) => {
    if (isGameUpgrade(req)) {
      handleGameUpgrade(req, socket, head);
    } else {
      nextUpgrade(req, socket, head).catch(() => socket.destroy());
    }
  });

  server.listen(port, host, () => {
    console.log(
      `> Mythic Table listening on http://${host}:${port} (${dev ? "dev" : "production"})`
    );
  });
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
