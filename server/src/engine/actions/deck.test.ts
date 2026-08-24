// Deck preparation tests: LOAD_DECK and SET_COMMANDER.

import { describe, expect, it } from "vitest";
import { personalize } from "../view";
import { act, mustFail, mustOk, setup } from "./testUtils";

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

describe("SET_COMMANDER", () => {
  it("places the chosen card alone in the command zone", () => {
    const { game, ctx, ada } = setup();
    mustOk(
      act(game, ctx, ada, { type: "SET_COMMANDER", cardId: "cmd-atarxa", name: "Atraxa" })
    );
    expect(ada.zones.command).toHaveLength(1);
    expect(ada.zones.command[0]?.cardId).toBe("cmd-atarxa");
    expect(ada.zones.command[0]?.annotations[0]).toBe("†Atraxa");
    expect(ada.hasDeck).toBe(true);
    expect(game.chat.at(-1)?.kind).toBe("system");
  });

  it("re-picking replaces the previous commander", () => {
    const { game, ctx, ada } = setup();
    mustOk(act(game, ctx, ada, { type: "SET_COMMANDER", cardId: "a", name: "First" }));
    mustOk(act(game, ctx, ada, { type: "SET_COMMANDER", cardId: "b", name: "Second" }));
    expect(ada.zones.command).toHaveLength(1);
    expect(ada.zones.command[0]?.cardId).toBe("b");
  });

  it("picking a commander from the loaded deck removes that copy", () => {
    const { game, ctx, ada } = setup();
    mustOk(
      act(game, ctx, ada, {
        type: "LOAD_DECK",
        library: [
          { cardId: "krenko", count: 1 },
          { cardId: "mountain", count: 99 },
        ],
        sideboard: [],
      })
    );
    expect(ada.zones.library).toHaveLength(100);
    mustOk(act(game, ctx, ada, { type: "SET_COMMANDER", cardId: "krenko", name: "Krenko" }));
    expect(ada.zones.library).toHaveLength(99);
    expect(ada.zones.library.some((c) => c.cardId === "krenko")).toBe(false);
    expect(ada.zones.command).toHaveLength(1);
    // re-picking after the copy left the library still works
    mustOk(act(game, ctx, ada, { type: "SET_COMMANDER", cardId: "krenko", name: "Krenko" }));
    expect(ada.zones.library).toHaveLength(99);
    expect(ada.zones.command).toHaveLength(1);
  });

  it("rejects junk ids", () => {
    const { game, ctx, ada } = setup();
    mustFail(
      act(game, ctx, ada, { type: "SET_COMMANDER", cardId: "", name: "X" }),
      "bad commander"
    );
  });

  it("a commander leaving the battlefield survives — it is not a token", () => {
    const { game, ctx, ada, bob } = setup();
    mustOk(act(game, ctx, ada, { type: "SET_COMMANDER", cardId: "cmd-atarxa", name: "Atraxa" }));
    mustOk(act(game, ctx, bob, { type: "SET_COMMANDER", cardId: "cmd-bob", name: "Ragavan" }));
    mustOk(act(game, ctx, ada, { type: "START_GAME" }));
    const uid = ada.zones.command[0]?.uid;
    if (!uid) throw new Error("no commander");
    // cast, then the routine death flow: back to the command zone
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid, to: "battlefield" }));
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid, to: "command" }));
    expect(ada.zones.command.some((c) => c.uid === uid)).toBe(true);
    const last = game.chat.at(-1);
    if (last?.kind !== "system") throw new Error("expected system message");
    expect(last.text).not.toContain("ceases to exist");
    // a bounce to hand keeps it a real card too
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid, to: "battlefield" }));
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid, to: "hand" }));
    expect(ada.zones.hand.some((c) => c.uid === uid)).toBe(true);
  });

  it("shows the commander to everyone via the public command zone", () => {
    const { game, ctx, ada, bob } = setup();
    mustOk(act(game, ctx, ada, { type: "SET_COMMANDER", cardId: "cmd-1", name: "Krenko" }));
    const bobView = personalize(game, bob.id);
    const adaFromBob = bobView.players.find((p) => p.id === ada.id);
    if (adaFromBob?.zones.command.kind !== "cards") throw new Error("expected cards");
    expect(adaFromBob.zones.command.cards[0]?.cardId).toBe("cmd-1");
    expect(bobView.format).toBe("freeform");
  });
});
