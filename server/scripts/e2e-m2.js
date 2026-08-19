// M2 end-to-end check over the real /ws endpoint. Run with the dev server up:
//   node scripts/e2e-m2.js
// Exercises: create → join → chat → deck-less start → draw → hidden-info
// personalization → disconnect/reconnect via token.

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
  console.log("create + join:");
  const host = new Client("host");
  await host.opened();
  host.send({ kind: "create", name: "Ada" });
  await host.until(() => true).then((s) => s);
  const code = host.welcome.code;
  check("host got a welcome with code format", /^[A-Z]+-\d{4}$/.test(code), code);

  const guest = new Client("guest");
  await guest.opened();
  guest.send({ kind: "join", code, name: "Bob" });
  await guest.until((s) => s.players.length === 2);
  check("guest sees both players", guest.snapshots.at(-1).players.length === 2);
  await host.until((s) => s.players.length === 2);
  check("host sees the guest join", host.snapshots.at(-1).players.some((p) => p.name === "Bob"));

  console.log("chat:");
  guest.send({ kind: "action", action: { type: "SEND_CHAT", text: "hello table" } });
  await host.until((s) => s.chat.some((m) => m.kind === "text" && m.text === "hello table"));
  check("host received guest chat", true);

  console.log("deck + start + draw:");
  host.send({
    kind: "action",
    action: {
      type: "LOAD_DECK",
      library: [
        { cardId: "scryfall-bolt", count: 4 },
        { cardId: "scryfall-mountain", count: 36 },
      ],
      sideboard: [{ cardId: "scryfall-thing", count: 3 }],
    },
  });
  await host.until((s) => s.players.find((p) => p.name === "Ada")?.hasDeck === true);
  check("host hasDeck flag visible to all", true);
  await guest.until((s) => s.players.find((p) => p.name === "Ada")?.hasDeck === true);
  check("guest also sees host hasDeck", true);

  host.send({ kind: "action", action: { type: "START_GAME" } });
  await host.until((s) => s.started === true);
  check("game started", true);

  host.send({ kind: "action", action: { type: "DRAW_CARDS", count: 7 } });
  const hostView = await host.until(
    (s) => s.players.find((p) => p.name === "Ada").zones.hand.kind === "cards" &&
      s.players.find((p) => p.name === "Ada").zones.hand.cards.length === 7
  );
  const hostHand = hostView.players.find((p) => p.name === "Ada").zones.hand;
  check("host sees own hand with cardIds", hostHand.cards.every((c) => c.cardId !== null));

  await guest.until((s) => {
    const hand = s.players.find((p) => p.name === "Ada").zones.hand;
    return hand.kind === "count" && hand.count === 7;
  });
  const guestView = guest.snapshots.at(-1);
  const hostFromGuest = guestView.players.find((p) => p.name === "Ada");
  check("guest sees only a hand count", hostFromGuest.zones.hand.count === 7, JSON.stringify(hostFromGuest.zones.hand));
  check(
    "guest sees the right library count",
    hostFromGuest.zones.library.kind === "count" && hostFromGuest.zones.library.count === 33
  );

  console.log("reveal:");
  const uids = hostHand.cards.slice(0, 2).map((c) => ({ uid: c.uid, name: "Test Card" }));
  host.send({ kind: "action", action: { type: "REVEAL_CARDS", cards: uids } });
  await guest.until((s) => s.chat.some((m) => m.kind === "reveal"));
  const reveal = guest.snapshots.at(-1).chat.find((m) => m.kind === "reveal");
  check("reveal reached guest chat with names", reveal.cards.length === 2 && reveal.cards[0].name === "Test Card");

  console.log("dice + turn:");
  guest.send({ kind: "action", action: { type: "ROLL_DIE", sides: 20 } });
  await host.until((s) => s.chat.some((m) => m.kind === "dice"));
  check("dice result broadcast", true);
  guest.send({ kind: "action", action: { type: "NEXT_TURN" } });
  await host.until((s) => s.activePlayerId === host.welcome.you ? false : s.players.find((p) => p.id === s.activePlayerId)?.name === "Bob");
  check("turn passed to Bob", true);

  console.log("ownership:");
  const stolenUid = hostHand.cards[0].uid;
  guest.send({ kind: "action", action: { type: "MOVE_CARD", uid: stolenUid, to: "battlefield" } });
  await sleep(300);
  check("guest cannot move host's card", guest.errors.some((e) => e.includes("not found")), JSON.stringify(guest.errors));

  console.log("reconnect via token:");
  const token = host.welcome.token;
  host.close();
  await guest.until((s) => s.players.find((p) => p.name === "Ada")?.connected === false);
  check("guest sees host disconnected", true);

  const host2 = new Client("host-rejoin");
  await host2.opened();
  host2.send({ kind: "rejoin", code, token });
  await host2.until((s) => s.players.find((p) => p.name === "Ada")?.connected === true);
  check("host rejoined by token with hand intact", host2.snapshots.at(-1).players.find((p) => p.name === "Ada").zones.hand.cards.length === 7);
  await guest.until((s) => s.players.find((p) => p.name === "Ada")?.connected === true);
  check("guest sees host reconnected", true);

  console.log("bad room:");
  const stray = new Client("stray");
  await stray.opened();
  stray.send({ kind: "join", code: "NOSUCH-9999", name: "Nobody" });
  await sleep(300);
  check("unknown room rejected", stray.errors.some((e) => e.includes("room not found")));

  host2.close();
  guest.close();
  stray.close();

  if (failures > 0) {
    console.error(`\n${failures} FAILURES`);
    process.exit(1);
  }
  console.log("\nall M2 checks passed");
}

main().catch((err) => {
  console.error("e2e error:", err.message);
  process.exit(1);
});
