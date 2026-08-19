// Engine unit tests: every action's happy path, structural validation,
// ownership rejection, and the hidden-info filtering in view.ts.

import { describe, expect, it } from "vitest";
import type { Action, CardInstance } from "@mythic/shared";
import { applyAction, type Ctx } from "./actions";
import { seededRng } from "./rng";
import {
  createGame,
  makePlayer,
  type Game,
  type Player,
} from "./state";
import { personalize } from "./view";

function setup(): { game: Game; ctx: Ctx; ada: Player; bob: Player } {
  const game = createGame("TEST-0001");
  const ctx: Ctx = { rng: seededRng(42), now: () => 1_000 };
  const ada = makePlayer(game, "Ada", "tok-ada", ctx.rng);
  const bob = makePlayer(game, "Bob", "tok-bob", ctx.rng);
  game.players.push(ada, bob);
  return { game, ctx, ada, bob };
}

/** Load a deck of `n` distinct cards for a player and start the game. */
function startWithDeck(
  game: Game,
  ctx: Ctx,
  player: Player,
  n = 40
): void {
  const r = applyAction(
    game,
    {
      type: "LOAD_DECK",
      library: Array.from({ length: n }, (_, i) => ({ cardId: `card-${i}`, count: 1 })),
      sideboard: [{ cardId: `side-0`, count: 15 }],
    },
    player.id,
    ctx
  );
  expect(r.ok).toBe(true);
  const r2 = applyAction(game, { type: "START_GAME" }, player.id, ctx);
  expect(r2.ok).toBe(true);
}

function act(game: Game, ctx: Ctx, player: Player, action: Action) {
  return applyAction(game, action, player.id, ctx);
}

function mustOk(result: ReturnType<typeof applyAction>) {
  expect(result.ok).toBe(true);
}

function mustFail(result: ReturnType<typeof applyAction>, fragment: string) {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toContain(fragment);
}

function uidAt(zone: CardInstance[], index: number): string {
  const card = zone[index];
  if (!card) throw new Error(`no card at index ${index}`);
  return card.uid;
}

// --- LOAD_DECK ---------------------------------------------------------------

describe("LOAD_DECK", () => {
  it("fills the library shuffled and the sideboard, and marks hasDeck", () => {
    const { game, ctx, ada } = setup();
    const result = act(game, ctx, ada, {
      type: "LOAD_DECK",
      library: [
        { cardId: "a", count: 30 },
        { cardId: "b", count: 10 },
      ],
      sideboard: [{ cardId: "c", count: 15 }],
    });
    mustOk(result);
    expect(ada.zones.library).toHaveLength(40);
    expect(ada.zones.sideboard).toHaveLength(15);
    expect(ada.hasDeck).toBe(true);
    const ids = ada.zones.library.map((c) => c.cardId);
    const countA = ids.filter((id) => id === "a").length;
    expect(countA).toBe(30);
    expect(game.chat.at(-1)?.kind).toBe("system");
  });

  it("is deterministic for a fixed seed", () => {
    const one = setup();
    const two = setup();
    act(one.game, one.ctx, one.ada, {
      type: "LOAD_DECK",
      library: Array.from({ length: 20 }, (_, i) => ({ cardId: `x${i}`, count: 1 })),
      sideboard: [],
    });
    act(two.game, two.ctx, two.ada, {
      type: "LOAD_DECK",
      library: Array.from({ length: 20 }, (_, i) => ({ cardId: `x${i}`, count: 1 })),
      sideboard: [],
    });
    expect(one.ada.zones.library.map((c) => c.cardId)).toEqual(
      two.ada.zones.library.map((c) => c.cardId)
    );
  });

  it("rejects empty and malformed decks", () => {
    const { game, ctx, ada } = setup();
    mustFail(act(game, ctx, ada, { type: "LOAD_DECK", library: [], sideboard: [] }), "empty");
    mustFail(
      act(game, ctx, ada, {
        type: "LOAD_DECK",
        library: [{ cardId: "a", count: 0 }],
        sideboard: [],
      }),
      "deck has 0 cards"
    );
  });
});

// --- START_GAME / NEXT_TURN ---------------------------------------------------

describe("START_GAME and NEXT_TURN", () => {
  it("starts with the first player and cycles turns", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    expect(game.started).toBe(true);
    expect(game.activePlayerId).toBe(ada.id);
    mustOk(act(game, ctx, bob, { type: "NEXT_TURN" }));
    expect(game.activePlayerId).toBe(bob.id);
    mustOk(act(game, ctx, ada, { type: "NEXT_TURN" }));
    expect(game.activePlayerId).toBe(ada.id);
  });

  it("rejects actions before the game starts", () => {
    const { game, ctx, ada } = setup();
    mustFail(act(game, ctx, ada, { type: "DRAW_CARDS", count: 1 }), "not started");
  });

  it("rejects double start", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada);
    mustFail(act(game, ctx, ada, { type: "START_GAME" }), "already started");
  });
});

// --- DRAW_CARDS ---------------------------------------------------------------

describe("DRAW_CARDS", () => {
  it("draws from the top of the library into the hand", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada);
    const top = uidAt(ada.zones.library, 0);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 7 }));
    expect(ada.zones.hand).toHaveLength(7);
    expect(ada.zones.library).toHaveLength(33);
    expect(ada.zones.hand[0]?.uid).toBe(top);
  });

  it("draws only what remains when over-drawing", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 3);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 99 }));
    expect(ada.zones.hand).toHaveLength(3);
    expect(ada.zones.library).toHaveLength(0);
  });
});

// --- MOVE_CARD / MOVE_CARD_INDEX ----------------------------------------------

describe("MOVE_CARD and MOVE_CARD_INDEX", () => {
  it("moves hand → battlefield → top of library (default for library)", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 1 }));
    const uid = uidAt(ada.zones.hand, 0);
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid, to: "battlefield" }));
    expect(ada.zones.battlefield).toHaveLength(1);
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid, to: "library" }));
    expect(uidAt(ada.zones.library, 0)).toBe(uid);
  });

  it("respects an explicit index (bottom of library)", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 10);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 1 }));
    const uid = uidAt(ada.zones.hand, 0);
    const bottom = uidAt(ada.zones.library, ada.zones.library.length - 1);
    mustOk(
      act(game, ctx, ada, {
        type: "MOVE_CARD",
        uid,
        to: "library",
        index: ada.zones.library.length,
      })
    );
    expect(uidAt(ada.zones.library, ada.zones.library.length - 1)).toBe(uid);
    expect(uidAt(ada.zones.library, ada.zones.library.length - 2)).toBe(bottom);
  });

  it("reorders within the library (put drawn card back on top)", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 10);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 3 }));
    const uid = uidAt(ada.zones.hand, 2);
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid, to: "library", index: 0 }));
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD_INDEX", uid, index: 5 }));
    expect(uidAt(ada.zones.library, 5)).toBe(uid);
  });

  it("rejects moving another player's card", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 1 }));
    const uid = uidAt(ada.zones.hand, 0);
    mustFail(act(game, ctx, bob, { type: "MOVE_CARD", uid, to: "battlefield" }), "not found");
  });

  it("detaches followers when a host leaves the battlefield", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 2 }));
    const host = uidAt(ada.zones.hand, 0);
    const aura = uidAt(ada.zones.hand, 1);
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid: host, to: "battlefield" }));
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid: aura, to: "battlefield" }));
    mustOk(act(game, ctx, ada, { type: "ATTACH_CARD", uid: aura, to: host }));
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid: host, to: "graveyard" }));
    const auraCard = ada.zones.battlefield.find((c) => c.uid === aura);
    expect(auraCard?.attachedTo).toBeUndefined();
  });
});

// --- card field mutations ------------------------------------------------------

describe("SET_TAPPED / SET_FACE_DOWN / SET_POSITION / SET_COUNTERS", () => {
  function playOne(): { game: Game; ctx: Ctx; ada: Player; bob: Player; uid: string } {
    const s = setup();
    startWithDeck(s.game, s.ctx, s.ada);
    mustOk(act(s.game, s.ctx, s.ada, { type: "DRAW_CARDS", count: 1 }));
    const uid = uidAt(s.ada.zones.hand, 0);
    mustOk(act(s.game, s.ctx, s.ada, { type: "MOVE_CARD", uid, to: "battlefield" }));
    return { ...s, uid };
  }

  it("taps, flips, positions, and counters a card", () => {
    const { game, ctx, ada, uid } = playOne();
    mustOk(act(game, ctx, ada, { type: "SET_TAPPED", uid, value: true }));
    mustOk(act(game, ctx, ada, { type: "SET_FACE_DOWN", uid, value: true }));
    mustOk(act(game, ctx, ada, { type: "SET_POSITION", uid, x: 120, y: -5 }));
    mustOk(
      act(game, ctx, ada, { type: "SET_COUNTERS", uid, counters: { "+1/+1": 3 } })
    );
    const card = ada.zones.battlefield[0];
    expect(card?.tapped).toBe(true);
    expect(card?.faceDown).toBe(true);
    expect(card?.x).toBe(100);
    expect(card?.y).toBe(0);
    expect(card?.counters["+1/+1"]).toBe(3);
  });

  it("drops zero counters and rejects junk", () => {
    const { game, ctx, ada, uid } = playOne();
    mustOk(
      act(game, ctx, ada, { type: "SET_COUNTERS", uid, counters: { "+1/+1": 3, "stun": 0 } })
    );
    expect(Object.keys(ada.zones.battlefield[0]?.counters ?? {})).toEqual(["+1/+1"]);
    mustFail(
      act(game, ctx, ada, { type: "SET_COUNTERS", uid, counters: { "x": -1 } }),
      "bad counters"
    );
  });

  it("rejects acting on another player's card", () => {
    const { game, ctx, ada, bob, uid } = playOne();
    mustFail(act(game, ctx, bob, { type: "SET_TAPPED", uid, value: true }), "not found");
  });
});

// --- ATTACH_CARD ---------------------------------------------------------------

describe("ATTACH_CARD", () => {
  it("attaches and detaches", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 2 }));
    const a = uidAt(ada.zones.hand, 0);
    const b = uidAt(ada.zones.hand, 1);
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid: a, to: "battlefield" }));
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid: b, to: "battlefield" }));
    mustOk(act(game, ctx, ada, { type: "ATTACH_CARD", uid: b, to: a }));
    expect(ada.zones.battlefield.find((c) => c.uid === b)?.attachedTo).toBe(a);
    mustOk(act(game, ctx, ada, { type: "ATTACH_CARD", uid: b, to: null }));
    expect(ada.zones.battlefield.find((c) => c.uid === b)?.attachedTo).toBeUndefined();
  });

  it("rejects self-attachment and cycles", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 2 }));
    const a = uidAt(ada.zones.hand, 0);
    const b = uidAt(ada.zones.hand, 1);
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid: a, to: "battlefield" }));
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid: b, to: "battlefield" }));
    mustFail(act(game, ctx, ada, { type: "ATTACH_CARD", uid: a, to: a }), "itself");
    mustOk(act(game, ctx, ada, { type: "ATTACH_CARD", uid: b, to: a }));
    mustFail(act(game, ctx, ada, { type: "ATTACH_CARD", uid: a, to: b }), "cycle");
  });
});

// --- CREATE_TOKEN / REVEAL_CARDS ------------------------------------------------

describe("CREATE_TOKEN and REVEAL_CARDS", () => {
  it("mints tokens with the name as an annotation", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada);
    mustOk(
      act(game, ctx, ada, {
        type: "CREATE_TOKEN",
        name: "Goblin",
        cardId: "tok-goblin",
        count: 3,
      })
    );
    const tokens = ada.zones.battlefield.slice(-3);
    expect(tokens).toHaveLength(3);
    expect(tokens.every((c) => c.annotations.includes("Goblin"))).toBe(true);
    expect(tokens.every((c) => c.cardId === "tok-goblin")).toBe(true);
    expect(game.chat.at(-1)?.kind).toBe("system");
  });

  it("allows nameless tokens rendered from annotations only", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada);
    mustOk(act(game, ctx, ada, { type: "CREATE_TOKEN", name: "Sheep", count: 1 }));
    expect(ada.zones.battlefield.at(-1)?.cardId).toBe("");
  });

  it("rejects bad token requests", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada);
    mustFail(
      act(game, ctx, ada, { type: "CREATE_TOKEN", name: "Goblin", count: 99 }),
      "token count"
    );
    mustFail(act(game, ctx, ada, { type: "CREATE_TOKEN", name: "  ", count: 1 }), "name");
  });

  it("reveals own cards as a chat message with server-truth cardIds", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 2 }));
    const uids = ada.zones.hand.map((c) => c.uid);
    mustOk(
      act(game, ctx, ada, {
        type: "REVEAL_CARDS",
        cards: uids.map((uid, i) => ({ uid, name: `Name ${i}` })),
      })
    );
    const last = game.chat.at(-1);
    expect(last?.kind).toBe("reveal");
    if (last?.kind === "reveal") {
      expect(last.cards).toHaveLength(2);
      for (const card of last.cards) {
        expect(ada.zones.hand.some((c) => c.cardId === card.cardId)).toBe(true);
      }
    }
  });

  it("refuses to reveal another player's cards or nothing", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 1 }));
    const uid = uidAt(ada.zones.hand, 0);
    mustFail(
      act(game, ctx, bob, { type: "REVEAL_CARDS", cards: [{ uid, name: "X" }] }),
      "not found"
    );
    mustFail(act(game, ctx, ada, { type: "REVEAL_CARDS", cards: [] }), "reveal");
  });
});

// --- SHUFFLE / SET_LIFE / ROLL_DIE / SEND_CHAT / LEAVE_GAME ----------------------

describe("SHUFFLE_LIBRARY, SET_LIFE, ROLL_DIE, SEND_CHAT, LEAVE_GAME", () => {
  it("shuffles as a permutation and announces it", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 20);
    const before = ada.zones.library.map((c) => c.cardId).sort();
    mustOk(act(game, ctx, ada, { type: "SHUFFLE_LIBRARY" }));
    const after = ada.zones.library.map((c) => c.cardId).sort();
    expect(after).toEqual(before);
    expect(game.chat.at(-1)?.kind).toBe("system");
  });

  it("sets life within bounds", () => {
    const { game, ctx, ada } = setup();
    mustOk(act(game, ctx, ada, { type: "SET_LIFE", life: -3 }));
    expect(ada.life).toBe(-3);
    mustFail(act(game, ctx, ada, { type: "SET_LIFE", life: 1.5 }), "life");
  });

  it("rolls in-range dice and logs them", () => {
    const { game, ctx, ada } = setup();
    for (let i = 0; i < 50; i++) {
      mustOk(act(game, ctx, ada, { type: "ROLL_DIE", sides: 20 }));
    }
    const dice = game.chat.filter((m) => m.kind === "dice");
    expect(dice).toHaveLength(50);
    for (const m of dice) {
      if (m.kind === "dice") expect(m.result).toBeGreaterThanOrEqual(1);
      if (m.kind === "dice") expect(m.result).toBeLessThanOrEqual(20);
    }
    mustFail(act(game, ctx, ada, { type: "ROLL_DIE", sides: 7 }), "die");
  });

  it("chats, caps length, rejects empties", () => {
    const { game, ctx, ada } = setup();
    mustOk(act(game, ctx, ada, { type: "SEND_CHAT", text: "  hello  " }));
    const last = game.chat.at(-1);
    expect(last?.kind === "text" && last.text).toBe("hello");
    mustFail(act(game, ctx, ada, { type: "SEND_CHAT", text: "   " }), "empty");
  });

  it("removes a leaving player and advances the turn if it was theirs", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    expect(game.activePlayerId).toBe(ada.id);
    mustOk(act(game, ctx, ada, { type: "LEAVE_GAME" }));
    expect(game.players.map((p) => p.id)).toEqual([bob.id]);
    expect(game.activePlayerId).toBe(bob.id);
  });
});

// --- hidden information ---------------------------------------------------------

describe("personalized snapshots", () => {
  it("hides opponents' hand/library/sideboard but shows counts", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 5 }));

    const bobView = personalize(game, bob.id);
    const adaFromBob = bobView.players.find((p) => p.id === ada.id);
    expect(adaFromBob?.zones.hand).toEqual({ kind: "count", count: 5 });
    expect(adaFromBob?.zones.library).toEqual({ kind: "count", count: 35 });
    expect(adaFromBob?.zones.sideboard).toEqual({ kind: "count", count: 15 });

    const adaView = personalize(game, ada.id);
    const self = adaView.players.find((p) => p.id === ada.id);
    expect(self?.zones.hand.kind).toBe("cards");
    if (self?.zones.hand.kind === "cards") {
      expect(self.zones.hand.cards).toHaveLength(5);
      expect(self.zones.hand.cards.every((c) => c.cardId !== null)).toBe(true);
    }
  });

  it("hides face-down battlefield identities from opponents, not the owner", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 1 }));
    const uid = uidAt(ada.zones.hand, 0);
    const realId = ada.zones.hand[0]?.cardId;
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid, to: "battlefield" }));
    mustOk(act(game, ctx, ada, { type: "SET_FACE_DOWN", uid, value: true }));

    const bobView = personalize(game, bob.id);
    const adaFromBob = bobView.players.find((p) => p.id === ada.id);
    if (adaFromBob?.zones.battlefield.kind !== "cards") throw new Error("expected cards");
    expect(adaFromBob.zones.battlefield.cards[0]?.cardId).toBeNull();

    const adaView = personalize(game, ada.id);
    const self = adaView.players.find((p) => p.id === ada.id);
    if (self?.zones.battlefield.kind !== "cards") throw new Error("expected cards");
    expect(self.zones.battlefield.cards[0]?.cardId).toBe(realId);
  });

  it("keeps shared zones public and passes chat through", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 1 }));
    const uid = uidAt(ada.zones.hand, 0);
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid, to: "graveyard" }));
    mustOk(act(game, ctx, bob, { type: "SEND_CHAT", text: "hi" }));

    const bobView = personalize(game, bob.id);
    const adaFromBob = bobView.players.find((p) => p.id === ada.id);
    if (adaFromBob?.zones.graveyard.kind !== "cards") throw new Error("expected cards");
    expect(adaFromBob.zones.graveyard.cards[0]?.cardId).toBe(
      ada.zones.graveyard[0]?.cardId
    );
    const lastMsg = bobView.chat.at(-1);
    if (lastMsg?.kind !== "text") throw new Error("expected text message");
    expect(lastMsg.text).toBe("hi");
  });
});
