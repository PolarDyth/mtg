// Security hardening e2e over the real /ws endpoint (issues #59/#60, audit
// items SEC-11..14). Run with the server up:  node scripts/e2e-security.js
// Exercises: /game/%ZZ must render (not 500) → duplicate display names
// rejected → token rejoin unaffected → multi-socket close keeps the seat
// connected → banned token cannot rejoin.

const http = require("node:http");
const WebSocket = require("ws");

const URL_ = "ws://localhost:3000/ws";
let failures = 0;

function check(name, cond, extra = "") {
  if (cond) {
    console.log(`  ok: ${name}`);
  } else {
    failures++;
    console.error(`  FAIL: ${name} ${extra}`);
  }
}

/** Minimal test client: send, and collect snapshots until a predicate hits. */
class Client {
  constructor(label) {
    this.label = label;
    this.snapshots = [];
    this.welcome = null;
    this.errors = [];
    this.ws = new WebSocket(URL_);
    this.ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "welcome") this.welcome = msg;
      else if (msg.type === "snapshot") this.snapshots.push(msg.state);
      else if (msg.type === "error") this.errors.push(msg.message);
    });
  }

  opened() {
    return new Promise((resolve, reject) => {
      this.ws.on("open", resolve);
      this.ws.on("error", reject);
    });
  }

  send(msg) {
    this.ws.send(JSON.stringify(msg));
  }

  /** Wait until a snapshot satisfying `pred` arrives. */
  until(pred, timeoutMs = 5000) {
    const existing = this.snapshots.find(pred);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${this.label}: condition timed out`)),
        timeoutMs
      );
      const onMessage = (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "snapshot" && pred(msg.state)) {
          clearTimeout(timer);
          this.ws.off("message", onMessage);
          resolve(msg.state);
        }
      };
      this.ws.on("message", onMessage);
    });
  }

  close() {
    this.ws.close();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Raw http (not fetch — the WHATWG URL parser may re-encode "%ZZ", node:http
 *  sends the path verbatim) so the route really sees the invalid escape. */
function getPage(path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "localhost", port: 3000, path }, (res) => {
        res.resume(); // drain so the socket frees
        resolve(res.statusCode);
      })
      .on("error", reject);
  });
}

async function main() {
  console.log("bad room-code URL (SEC-14):");
  const status = await getPage("/game/%ZZ");
  check("/game/%ZZ renders (200, was 500)", status === 200, `got ${status}`);
  const truncated = await getPage("/game/%E4%BD");
  check("/game/%E4%BD renders (200)", truncated === 200, `got ${truncated}`);

  console.log("duplicate display names (SEC-11):");
  const host = new Client("host");
  await host.opened();
  host.send({ kind: "create", name: "alice" });
  await host.until(() => true);
  const code = host.welcome.code;
  check("host seated", /^[A-Z]+-[A-Z]+-\d{4}$/.test(code), code);

  const dup = new Client("dup");
  await dup.opened();
  dup.send({ kind: "join", code, name: "alice" });
  await sleep(300);
  check(
    "exact duplicate name rejected",
    dup.errors.some((e) => e.includes("name is already taken")),
    JSON.stringify(dup.errors)
  );

  const dupCase = new Client("dup-case");
  await dupCase.opened();
  dupCase.send({ kind: "join", code, name: "ALICE" });
  await sleep(300);
  check(
    "case-insensitive duplicate rejected",
    dupCase.errors.some((e) => e.includes("name is already taken")),
    JSON.stringify(dupCase.errors)
  );

  const bob = new Client("bob");
  await bob.opened();
  bob.send({ kind: "join", code, name: "bob" });
  await bob.until((s) => s.players.length === 2);
  check("distinct name still seats", bob.welcome !== null);

  console.log("token rejoin with own taken name (SEC-11 collateral):");
  const host2 = new Client("host-tab2");
  await host2.opened();
  host2.send({ kind: "rejoin", code, token: host.welcome.token });
  await host2.until(() => true);
  check("second tab rejoined by token despite taken name", host2.welcome !== null);

  console.log("multi-socket close (SEC-13):");
  host2.close();
  await sleep(300);
  host.send({ kind: "action", action: { type: "SEND_CHAT", text: "still here" } });
  await host.until((s) => s.chat.some((m) => m.kind === "text" && m.text === "still here"));
  check("remaining socket still broadcasts + acts", true);
  await bob.until(
    (s) =>
      s.chat.some((m) => m.kind === "text" && m.text === "still here") &&
      s.players.find((p) => p.name === "alice")?.connected === true
  );
  check("closing the second tab left the seat connected", true);

  console.log("banned token cannot rejoin (SEC-12):");
  host.send({ kind: "action", action: { type: "BAN_PLAYER", playerId: bob.welcome.you } });
  await host.until((s) => s.players.length === 1);
  await sleep(300);
  check(
    "banned socket got the boot",
    bob.errors.some((e) => e.includes("banned")),
    JSON.stringify(bob.errors)
  );

  const bobAgain = new Client("bob-rejoin");
  await bobAgain.opened();
  bobAgain.send({ kind: "rejoin", code, token: bob.welcome.token });
  await sleep(300);
  check(
    "banned token rejoin rejected",
    bobAgain.errors.length > 0 && bobAgain.welcome === null,
    JSON.stringify(bobAgain.errors)
  );

  const bobRename = new Client("bob-rename");
  await bobRename.opened();
  bobRename.send({ kind: "join", code, name: "bob" });
  await sleep(300);
  check(
    "banned name re-join rejected",
    bobRename.errors.some((e) => e.includes("banned")),
    JSON.stringify(bobRename.errors)
  );

  dup.close();
  dupCase.close();
  bob.close();
  bobAgain.close();
  bobRename.close();
  host.close();

  if (failures > 0) {
    console.error(`\n${failures} FAILURES`);
    process.exit(1);
  }
  console.log("\nall security e2e checks passed");
}

main().catch((err) => {
  console.error("e2e error:", err.message);
  process.exit(1);
});
