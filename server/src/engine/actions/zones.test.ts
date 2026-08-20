// Zone-flow tests: DRAW_CARDS, MOVE_CARD, MOVE_CARD_INDEX, SHUFFLE_LIBRARY.

import { describe, expect, it } from "vitest";
import { act, mustFail, mustOk, setup, startWithDeck, uidAt } from "./testUtils";

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
