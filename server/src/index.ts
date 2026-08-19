// Mythic Table entry point: one Node process serving both the Next.js app
// and (from M1) the game WebSocket server, on a single port.
//
// In dev, `tsx watch src/index.ts` boots Next in dev mode (Turbopack) through
// this custom server; in production `node dist/index.js` serves the build
// output from frontend/.next. The frontend directory is resolved relative to
// this file so both layouts work.

import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(here, "../../frontend");

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev, dir: frontendDir });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error("request handler error:", err);
    res.statusCode = 500;
    res.end("internal server error");
  });
});

server.listen(port, () => {
  console.log(
    `> Mythic Table listening on http://localhost:${port} (${dev ? "dev" : "production"})`
  );
});
