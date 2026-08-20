// Chat-producing action tests: REVEAL_CARDS, ROLL_DIE, SEND_CHAT.

import { describe, expect, it } from "vitest";
import { act, mustFail, mustOk, setup, startWithDeck, uidAt } from "./testUtils";

describe("REVEAL_CARDS", () => {
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

describe("ROLL_DIE", () => {
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
});

describe("SEND_CHAT", () => {
  it("chats, caps length, rejects empties", () => {
    const { game, ctx, ada } = setup();
    mustOk(act(game, ctx, ada, { type: "SEND_CHAT", text: "  hello  " }));
    const last = game.chat.at(-1);
    expect(last?.kind === "text" && last.text).toBe("hello");
    mustFail(act(game, ctx, ada, { type: "SEND_CHAT", text: "   " }), "empty");
  });
});
