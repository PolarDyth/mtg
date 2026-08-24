// Partner-commander smoke check over the real /ws endpoint (#41). Run with
// the dev server up:  node scripts/e2e-partners.js
// Exercises: LOAD_DECK with two commanders in the 99 → SET_COMMANDER with
// both picks (spliced out, both visible to the opponent) → partial re-pick
// (dropped partner returns to the library, kept one keeps its uid) →
// 3-card and duplicate rejections.

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

async function main() {
  const host = new Client("host");
  await host.opened();
  host.send({ kind: "create", name: "Ada" });
  await host.until((s) => s.players.length === 1);
  const code = host.welcome.code;

  const guest = new Client("guest");
  await guest.opened();
  guest.send({ kind: "join", code, name: "Bob" });
  await host.until((s) => s.players.length === 2);
  const you = host.welcome.you;

  const mine = (s) => s.players.find((p) => p.id === you);
  const myCommand = (s) => {
    const zone = mine(s).zones.command;
    return zone.kind === "cards" ? zone.cards : [];
  };
  const myLibraryCount = (s) => {
    const z = mine(s).zones.library;
    return z.kind === "cards" ? z.cards.length : z.count;
  };

  host.send({
    kind: "action",
    action: {
      type: "LOAD_DECK",
      library: [
        { cardId: "p-kodama", count: 1 },
        { cardId: "p-esika", count: 1 },
        { cardId: "p-sakashima", count: 1 },
        { cardId: "forest", count: 97 },
      ],
      sideboard: [],
    },
  });
  await host.until((s) => myLibraryCount(s) === 100);

  host.send({
    kind: "action",
    action: {
      type: "SET_COMMANDER",
      cards: [
        { cardId: "p-kodama", name: "Kodama" },
        { cardId: "p-esika", name: "Esika" },
      ],
    },
  });
  let s = await host.until((st) => myCommand(st).length === 2);
  check("both partners in the command zone", myCommand(s).length === 2);
  check("library shrank to 98", myLibraryCount(s) === 98, `got ${myLibraryCount(s)}`);
  check("chat names both", s.chat.some((m) => m.kind === "system" && m.text.includes("Kodama + Esika")));
  const kodamaUid = myCommand(s).find((c) => c.cardId === "p-kodama")?.uid;

  // opponent sees both, full card ids (public zone)
  const bobView = await guest.until(
    (st) =>
      st.players.find((p) => p.name === "Ada")?.zones.command.kind === "cards" &&
      st.players.find((p) => p.name === "Ada").zones.command.cards.length === 2
  );
  const bobSees = bobView.players.find((p) => p.name === "Ada").zones.command.cards;
  check("opponent sees both partners", bobSees.map((c) => c.cardId).join(",") === "p-kodama,p-esika");

  // partial re-pick: drop Esika, add Sakashima — Kodama must keep its uid
  host.send({
    kind: "action",
    action: {
      type: "SET_COMMANDER",
      cards: [
        { cardId: "p-kodama", name: "Kodama" },
        { cardId: "p-sakashima", name: "Sakashima" },
      ],
    },
  });
  s = await host.until((st) => myCommand(st).some((c) => c.cardId === "p-sakashima"));
  check("swap lands the new partner", myCommand(s).map((c) => c.cardId).join(",") === "p-kodama,p-sakashima");
  check("kept partner keeps its uid", myCommand(s).find((c) => c.cardId === "p-kodama")?.uid === kodamaUid);
  check("dropped partner returned to library (98)", myLibraryCount(s) === 98, `got ${myLibraryCount(s)}`);

  // rejections: three cards, duplicates
  host.send({
    kind: "action",
    action: {
      type: "SET_COMMANDER",
      cards: [
        { cardId: "a", name: "A" },
        { cardId: "b", name: "B" },
        { cardId: "c", name: "C" },
      ],
    },
  });
  await sleep(300);
  check("3 picks rejected", host.errors.some((e) => e.includes("bad commander count")));
  host.errors.length = 0;
  host.send({
    kind: "action",
    action: {
      type: "SET_COMMANDER",
      cards: [
        { cardId: "a", name: "A" },
        { cardId: "a", name: "A" },
      ],
    },
  });
  await sleep(300);
  check("duplicate picks rejected", host.errors.some((e) => e.includes("duplicate commander")));

  host.close();
  guest.close();

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall partner-commander checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
