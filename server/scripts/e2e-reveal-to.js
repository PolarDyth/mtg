// Ad-hoc e2e for targeted reveals over the real /ws endpoint.
//   node scripts/e2e-reveal-to.js   (dev server up)
// Verifies: reveal with `to` reaches only target + revealer; broadcast
// reaches everyone; bad audience rejected.

const WebSocket = require("ws");

const URL_ = "ws://localhost:3000/ws";
let failures = 0;

function check(name, cond, extra = "") {
  if (cond) console.log(`  ok: ${name}`);
  else {
    failures++;
    console.error(`  FAIL: ${name} ${extra}`);
  }
}

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
  async until(pred, timeoutMs = 5000) {
    const existing = this.snapshots.find(pred);
    if (existing) return existing;
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

async function main() {
  const ada = new Client("ada");
  await ada.opened();
  ada.send({ kind: "create", name: "Ada" });
  await ada.until(() => true);
  const code = ada.welcome.code;

  const bob = new Client("bob");
  await bob.opened();
  bob.send({ kind: "join", code, name: "Bob" });
  const cal = new Client("cal");
  await cal.opened();
  cal.send({ kind: "join", code, name: "Cal" });
  await ada.until((s) => s.players.length === 3);

  ada.send({
    kind: "action",
    action: {
      type: "LOAD_DECK",
      library: [{ cardId: "scryfall-bolt", count: 40 }],
      sideboard: [],
    },
  });
  await ada.until((s) => s.players[0]?.hasDeck === true);
  ada.send({ kind: "action", action: { type: "START_GAME" } });
  // START_GAME auto-draws opening hands — no manual draw needed
  const view = await ada.until(
    (s) => s.players.find((p) => p.name === "Ada").zones.hand.cards?.length === 7
  );
  const hand = view.players.find((p) => p.name === "Ada").zones.hand.cards;

  console.log("targeted reveal (Ada -> Bob only):");
  const bobId = view.players.find((p) => p.name === "Bob").id;
  ada.send({
    kind: "action",
    action: {
      type: "REVEAL_CARDS",
      cards: hand.map((c) => ({ uid: c.uid, name: "Secret Bolt" })),
      to: [bobId],
    },
  });
  await bob.until((s) => s.chat.some((m) => m.kind === "reveal" && m.to));
  await sleep(300);
  const bobChat = bob.snapshots.at(-1).chat.filter((m) => m.kind === "reveal");
  const calChat = cal.snapshots.at(-1).chat.filter((m) => m.kind === "reveal");
  const adaChat = ada.snapshots.at(-1).chat.filter((m) => m.kind === "reveal");
  check("target (Bob) sees the targeted reveal", bobChat.length === 1, JSON.stringify(bobChat.length));
  check("revealer (Ada) sees the targeted reveal", adaChat.length === 1);
  check("outsider (Cal) does NOT see the targeted reveal", calChat.length === 0, JSON.stringify(calChat.length));

  console.log("broadcast reveal:");
  ada.send({
    kind: "action",
    action: { type: "REVEAL_CARDS", cards: [{ uid: hand[0].uid, name: "Public Bolt" }] },
  });
  await cal.until((s) => s.chat.some((m) => m.kind === "reveal" && !m.to));
  check("outsider now sees the broadcast reveal", true);

  console.log("bad audience:");
  ada.send({
    kind: "action",
    action: {
      type: "REVEAL_CARDS",
      cards: [{ uid: hand[0].uid, name: "X" }],
      to: ["ghost-id"],
    },
  });
  await sleep(300);
  check("unknown target id rejected", ada.errors.some((e) => e.includes("target")));
  ada.send({
    kind: "action",
    action: { type: "REVEAL_CARDS", cards: [{ uid: hand[0].uid, name: "X" }], to: [] },
  });
  await sleep(300);
  check("empty target list rejected", ada.errors.filter((e) => e.includes("target")).length >= 2);

  ada.close();
  bob.close();
  cal.close();

  if (failures > 0) {
    console.error(`\n${failures} FAILURES`);
    process.exit(1);
  }
  console.log("\nall targeted-reveal checks passed");
}

main().catch((err) => {
  console.error("e2e error:", err.message);
  process.exit(1);
});
