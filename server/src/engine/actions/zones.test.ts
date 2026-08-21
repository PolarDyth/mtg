// Zone-flow tests: DRAW_CARDS, MOVE_CARD, MOVE_CARD_INDEX, SHUFFLE_LIBRARY,
// DISCARD_CARDS, DISCARD_RANDOM, MILL_CARDS, SCRY, SURVEIL.

import { describe, expect, it } from "vitest";
import { systemRng } from "../rng";
import { act, mustFail, mustOk, setup, startWithDeck, uidAt } from "./testUtils";

describe("DRAW_CARDS", () => {
  it("draws from the top of the library into the hand", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada); // opening hand of 7 auto-drawn on start
    const top = uidAt(ada.zones.library, 0);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 1 }));
    expect(ada.zones.hand).toHaveLength(8);
    expect(ada.zones.library).toHaveLength(32);
    expect(ada.zones.hand.at(-1)?.uid).toBe(top);
  });

  it("draws only what remains when over-drawing", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 8); // 7 auto-drawn, 1 left in the library
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 99 }));
    expect(ada.zones.hand).toHaveLength(8);
    expect(ada.zones.library).toHaveLength(0);
  });
});

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
    startWithDeck(game, ctx, ada, 20); // 13 left after the opening hand
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

describe("SHUFFLE_LIBRARY", () => {
  it("shuffles as a permutation and announces it", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 20);
    const before = ada.zones.library.map((c) => c.cardId).sort();
    mustOk(act(game, ctx, ada, { type: "SHUFFLE_LIBRARY" }));
    const after = ada.zones.library.map((c) => c.cardId).sort();
    expect(after).toEqual(before);
    expect(game.chat.at(-1)?.kind).toBe("system");
  });
});

describe("DRAW_CARDS logging", () => {
  it("announces the draw", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 7 }));
    const last = game.chat.at(-1);
    expect(last?.kind).toBe("system");
    if (last?.kind === "system") expect(last.text).toContain("draws 7");
  });

  it("stays silent when the library is empty", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 10); // 7 auto-drawn, 3 left
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 3 })); // now empty
    const chatLen = game.chat.length;
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 1 }));
    expect(game.chat).toHaveLength(chatLen);
  });
});

describe("MOVE_CARD logging and sentinels", () => {
  it('supports index: "bottom" (race-safe bottom of library)', () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 10);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 1 }));
    const uid = uidAt(ada.zones.hand, 0);
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid, to: "library", index: "bottom" }));
    expect(uidAt(ada.zones.library, ada.zones.library.length - 1)).toBe(uid);
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid, to: "library", index: "top" }));
    expect(uidAt(ada.zones.library, 0)).toBe(uid);
  });

  it("announces cross-zone moves with placement for library targets", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 1 }));
    const uid = uidAt(ada.zones.hand, 0);
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid, to: "battlefield" }));
    let last = game.chat.at(-1);
    expect(last?.kind).toBe("system");
    if (last?.kind === "system") expect(last.text).toContain("moves a card from hand to battlefield");
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid, to: "library", index: "bottom" }));
    last = game.chat.at(-1);
    if (last?.kind === "system") {
      expect(last.text).toContain("moves a card from battlefield to the bottom of their library");
    }
  });

  it("stays silent on same-zone moves", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 10);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 2 }));
    const uid = uidAt(ada.zones.hand, 0);
    const chatLen = game.chat.length;
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid, to: "hand" }));
    expect(game.chat).toHaveLength(chatLen);
  });
});

describe("DISCARD_CARDS", () => {
  it("moves the chosen hand cards to the graveyard in order and announces it", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada); // opening hand of 7
    const uids = [uidAt(ada.zones.hand, 2), uidAt(ada.zones.hand, 0)];
    mustOk(act(game, ctx, ada, { type: "DISCARD_CARDS", uids }));
    expect(ada.zones.hand).toHaveLength(5);
    expect(ada.zones.graveyard.map((c) => c.uid)).toEqual(uids);
    const last = game.chat.at(-1);
    expect(last?.kind).toBe("system");
    if (last?.kind === "system") expect(last.text).toContain("discards 2 cards");
  });

  it("rejects cards that are not in the actor's hand", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 2 }));
    const uid = uidAt(ada.zones.hand, 0);
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid, to: "battlefield" }));
    mustFail(
      act(game, ctx, ada, { type: "DISCARD_CARDS", uids: [uid] }),
      "card not in hand"
    );
    const other = uidAt(ada.zones.hand, 0);
    mustFail(
      act(game, ctx, ada, { type: "DISCARD_CARDS", uids: [other, uid] }),
      "card not in hand"
    );
  });

  it("rejects another player's card", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 1 }));
    const uid = uidAt(ada.zones.hand, 0);
    mustFail(act(game, ctx, bob, { type: "DISCARD_CARDS", uids: [uid] }), "card not in hand");
  });

  it("rejects duplicates and oversized lists", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 35);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 31 }));
    const uid = uidAt(ada.zones.hand, 0);
    mustFail(act(game, ctx, ada, { type: "DISCARD_CARDS", uids: [uid, uid] }), "duplicate");
    const all = ada.zones.hand.map((c) => c.uid);
    mustFail(act(game, ctx, ada, { type: "DISCARD_CARDS", uids: all }), "bad discard");
    mustFail(act(game, ctx, ada, { type: "DISCARD_CARDS", uids: [] }), "bad discard");
  });
});

describe("DISCARD_RANDOM", () => {
  it("moves N random hand cards to the graveyard, deterministically for a seed", () => {
    // two identical runs with the same seed must pick the same cards
    const run = () => {
      const s = setup();
      startWithDeck(s.game, s.ctx, s.ada); // opening hand of 7
      const handBefore = s.ada.zones.hand.map((c) => c.uid);
      mustOk(act(s.game, s.ctx, s.ada, { type: "DISCARD_RANDOM", count: 2 }));
      return {
        discarded: s.ada.zones.graveyard.map((c) => c.uid),
        hand: s.ada.zones.hand.map((c) => c.uid),
        handBefore,
        last: s.game.chat.at(-1),
      };
    };
    const a = run();
    const b = run();
    expect(a.discarded).toEqual(b.discarded);
    expect(a.discarded).toHaveLength(2);
    expect(new Set(a.discarded).size).toBe(2); // distinct picks
    expect(a.handBefore).toEqual(expect.arrayContaining(a.discarded)); // came from the hand
    expect(a.hand).toHaveLength(5);
    expect(a.hand).not.toEqual(expect.arrayContaining(a.discarded));
    expect(a.last?.kind).toBe("system");
    if (a.last?.kind === "system") {
      expect(a.last.text).toContain("discards 2 cards at random");
    }
  });

  it("clamps the count to the hand size; an empty hand discards nothing quietly", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 3); // hand 3 / library 0
    mustOk(act(game, ctx, ada, { type: "DISCARD_RANDOM", count: 30 }));
    expect(ada.zones.hand).toHaveLength(0);
    expect(ada.zones.graveyard).toHaveLength(3);
    const chatLen = game.chat.length;
    mustOk(act(game, ctx, ada, { type: "DISCARD_RANDOM", count: 1 }));
    expect(ada.zones.graveyard).toHaveLength(3);
    expect(game.chat).toHaveLength(chatLen);
  });

  it("rejects junk counts and pre-game use", () => {
    const { game, ctx, ada } = setup();
    mustFail(act(game, ctx, ada, { type: "DISCARD_RANDOM", count: 1 }), "not started");
    startWithDeck(game, ctx, ada);
    mustFail(act(game, ctx, ada, { type: "DISCARD_RANDOM", count: 0 }), "bad discard count");
    mustFail(act(game, ctx, ada, { type: "DISCARD_RANDOM", count: 1.5 }), "bad discard count");
    mustFail(act(game, ctx, ada, { type: "DISCARD_RANDOM", count: 31 }), "bad discard count");
  });

  it("picks vary under the production rng (uniformity guard)", () => {
    // guards the rng wiring, not the seed: with the crypto-backed system
    // rng, 60 single-card discards from a 7-card hand must hit more than
    // one original index (all-same has probability ~7^-59)
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada); // hand 7
    const sysCtx = { rng: systemRng(), now: () => 1_000 };
    const hits = new Set<number>();
    for (let trial = 0; trial < 60; trial++) {
      const before = ada.zones.hand.map((c) => c.uid);
      mustOk(act(game, sysCtx, ada, { type: "DISCARD_RANDOM", count: 1 }));
      const discarded = ada.zones.graveyard.at(-1);
      if (!discarded) throw new Error("expected a discarded card");
      hits.add(before.indexOf(discarded.uid));
      // return the card so every trial starts from a 7-card hand
      ada.zones.hand.push(ada.zones.graveyard.pop()!);
    }
    expect(hits.size).toBeGreaterThan(1);
  });
});

describe("MILL_CARDS", () => {
  it("moves the top N cards to the graveyard and announces it", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 40); // 33 left after the opening hand
    const top = [uidAt(ada.zones.library, 0), uidAt(ada.zones.library, 1)];
    mustOk(act(game, ctx, ada, { type: "MILL_CARDS", count: 2 }));
    expect(ada.zones.library).toHaveLength(31);
    expect(ada.zones.graveyard.map((c) => c.uid)).toEqual(top);
    const last = game.chat.at(-1);
    expect(last?.kind).toBe("system");
    if (last?.kind === "system") expect(last.text).toContain("mills 2 cards");
  });

  it("clamps to the library size when over-milling", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 8); // 7 auto-drawn, 1 left in the library
    mustOk(act(game, ctx, ada, { type: "MILL_CARDS", count: 10 }));
    expect(ada.zones.library).toHaveLength(0);
    expect(ada.zones.graveyard).toHaveLength(1);
  });

  it("rejects junk counts", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 10);
    mustFail(act(game, ctx, ada, { type: "MILL_CARDS", count: 0 }), "bad mill count");
    mustFail(act(game, ctx, ada, { type: "MILL_CARDS", count: 101 }), "bad mill count");
  });
});

describe("SCRY", () => {
  it("splits the top N between top and bottom in the given orders", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 20); // 13 left after the opening hand
    const c0 = uidAt(ada.zones.library, 0);
    const c1 = uidAt(ada.zones.library, 1);
    const c2 = uidAt(ada.zones.library, 2);
    const c3 = uidAt(ada.zones.library, 3);
    // keep c1 above c0 on top; c2 to the bottom
    mustOk(act(game, ctx, ada, { type: "SCRY", look: 3, top: [c1, c0], bottom: [c2] }));
    expect(ada.zones.library).toHaveLength(13);
    expect(uidAt(ada.zones.library, 0)).toBe(c1);
    expect(uidAt(ada.zones.library, 1)).toBe(c0);
    expect(uidAt(ada.zones.library, 2)).toBe(c3);
    expect(uidAt(ada.zones.library, 12)).toBe(c2);
    const last = game.chat.at(-1);
    expect(last?.kind).toBe("system");
    if (last?.kind === "system") expect(last.text).toContain("scries 3 (2 on top, 1 on bottom)");
  });

  it("covers the whole library when it holds fewer cards than look", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 9); // 7 auto-drawn, 2 left
    const c0 = uidAt(ada.zones.library, 0);
    const c1 = uidAt(ada.zones.library, 1);
    mustOk(act(game, ctx, ada, { type: "SCRY", look: 5, top: [c1], bottom: [c0] }));
    expect(uidAt(ada.zones.library, 0)).toBe(c1);
    expect(uidAt(ada.zones.library, 1)).toBe(c0);
  });

  it("rejects duplicates", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 10);
    const c0 = uidAt(ada.zones.library, 0);
    mustFail(
      act(game, ctx, ada, { type: "SCRY", look: 2, top: [c0, c0], bottom: [] }),
      "duplicate"
    );
  });

  it("rejects uids outside the top-look window (and cards not in the library)", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 20); // 13 left after the opening hand
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 1 }));
    const inHand = uidAt(ada.zones.hand, 0); // own card, but not in the library
    const deep = uidAt(ada.zones.library, 5); // in the library, below the window
    mustFail(
      act(game, ctx, ada, { type: "SCRY", look: 2, top: [deep], bottom: [] }),
      "top of the library"
    );
    mustFail(
      act(game, ctx, ada, { type: "SCRY", look: 2, top: [inHand], bottom: [] }),
      "top of the library"
    );
  });

  it("rejects partitions that do not cover the window", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 10);
    const c0 = uidAt(ada.zones.library, 0);
    mustFail(
      act(game, ctx, ada, { type: "SCRY", look: 3, top: [c0], bottom: [] }),
      "top of the library"
    );
  });

  it("rejects junk look values", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 10);
    mustFail(act(game, ctx, ada, { type: "SCRY", look: 0, top: [], bottom: [] }), "bad scry");
    mustFail(act(game, ctx, ada, { type: "SCRY", look: 11, top: [], bottom: [] }), "bad scry");
  });
});

describe("SURVEIL", () => {
  it("splits the top N between library top and graveyard in order", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 20);
    const c0 = uidAt(ada.zones.library, 0);
    const c1 = uidAt(ada.zones.library, 1);
    const c2 = uidAt(ada.zones.library, 2);
    const c3 = uidAt(ada.zones.library, 3);
    // c1 stays on top; c0 then c2 go to the graveyard (c0 deeper)
    mustOk(act(game, ctx, ada, { type: "SURVEIL", look: 3, top: [c1], graveyard: [c0, c2] }));
    expect(ada.zones.library).toHaveLength(11);
    expect(uidAt(ada.zones.library, 0)).toBe(c1);
    expect(uidAt(ada.zones.library, 1)).toBe(c3);
    expect(ada.zones.graveyard.map((c) => c.uid)).toEqual([c0, c2]);
    const last = game.chat.at(-1);
    expect(last?.kind).toBe("system");
    if (last?.kind === "system") {
      expect(last.text).toContain("surveils 3 (1 on top, 2 to graveyard)");
    }
  });

  it("rejects a bad partition like scry", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada, 10);
    const c0 = uidAt(ada.zones.library, 0);
    const c1 = uidAt(ada.zones.library, 1);
    mustFail(
      act(game, ctx, ada, { type: "SURVEIL", look: 3, top: [c0], graveyard: [c1] }),
      "top of the library"
    );
  });
});
