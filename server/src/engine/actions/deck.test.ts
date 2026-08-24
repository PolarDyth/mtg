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
      act(game, ctx, ada, {
        type: "SET_COMMANDER",
        cards: [{ cardId: "cmd-atarxa", name: "Atraxa" }],
      })
    );
    expect(ada.zones.command).toHaveLength(1);
    expect(ada.zones.command[0]?.cardId).toBe("cmd-atarxa");
    expect(ada.zones.command[0]?.annotations[0]).toBe("†Atraxa");
    expect(ada.hasDeck).toBe(true);
    expect(game.chat.at(-1)?.kind).toBe("system");
  });

  it("holds both partners — the second pick doesn't discard the first", () => {
    const { game, ctx, ada } = setup();
    mustOk(
      act(game, ctx, ada, {
        type: "SET_COMMANDER",
        cards: [
          { cardId: "kodama", name: "Kodama" },
          { cardId: "esika", name: "Esika" },
        ],
      })
    );
    expect(ada.zones.command.map((c) => c.cardId)).toEqual(["kodama", "esika"]);
    expect(ada.zones.command[0]?.annotations[0]).toBe("†Kodama");
    expect(ada.zones.command[1]?.annotations[0]).toBe("†Esika");
    const last = game.chat.at(-1);
    if (last?.kind !== "system") throw new Error("expected system message");
    expect(last.text).toContain("Kodama + Esika");
    expect(last.text).toContain("commanders");
  });

  it("re-picking swaps only the dropped partner, keeping the other's instance", () => {
    const { game, ctx, ada } = setup();
    mustOk(
      act(game, ctx, ada, {
        type: "SET_COMMANDER",
        cards: [
          { cardId: "a", name: "First" },
          { cardId: "b", name: "Second" },
        ],
      })
    );
    const keptUid = ada.zones.command[0]?.uid;
    mustOk(
      act(game, ctx, ada, {
        type: "SET_COMMANDER",
        cards: [
          { cardId: "a", name: "First" },
          { cardId: "c", name: "Third" },
        ],
      })
    );
    expect(ada.zones.command.map((c) => c.cardId)).toEqual(["a", "c"]);
    expect(ada.zones.command[0]?.uid).toBe(keptUid);
    // the dropped partner returned to the bottom of the library
    expect(ada.zones.library.at(-1)?.cardId).toBe("b");
  });

  it("re-picking an unchanged commander keeps its uid and notes", () => {
    const { game, ctx, ada } = setup();
    mustOk(
      act(game, ctx, ada, { type: "SET_COMMANDER", cards: [{ cardId: "krenko", name: "Krenko" }] })
    );
    const uid = ada.zones.command[0]?.uid;
    if (!uid) throw new Error("no commander");
    mustOk(act(game, ctx, ada, { type: "SET_NOTES", uid, notes: ["marked"] }));
    mustOk(
      act(game, ctx, ada, { type: "SET_COMMANDER", cards: [{ cardId: "krenko", name: "Krenko" }] })
    );
    expect(ada.zones.command).toHaveLength(1);
    expect(ada.zones.command[0]?.uid).toBe(uid);
    expect(ada.zones.command[0]?.annotations).toEqual(["†Krenko", "marked"]);
  });

  it("picking commanders from the loaded deck removes one copy each", () => {
    const { game, ctx, ada } = setup();
    mustOk(
      act(game, ctx, ada, {
        type: "LOAD_DECK",
        library: [
          { cardId: "krenko", count: 1 },
          { cardId: "esika", count: 1 },
          { cardId: "mountain", count: 98 },
        ],
        sideboard: [],
      })
    );
    expect(ada.zones.library).toHaveLength(100);
    mustOk(
      act(game, ctx, ada, {
        type: "SET_COMMANDER",
        cards: [
          { cardId: "krenko", name: "Krenko" },
          { cardId: "esika", name: "Esika" },
        ],
      })
    );
    expect(ada.zones.library).toHaveLength(98);
    expect(ada.zones.library.some((c) => c.cardId === "krenko")).toBe(false);
    expect(ada.zones.library.some((c) => c.cardId === "esika")).toBe(false);
    expect(ada.zones.command).toHaveLength(2);
    // re-sending the same set doesn't remove more copies from the 99
    mustOk(
      act(game, ctx, ada, {
        type: "SET_COMMANDER",
        cards: [
          { cardId: "krenko", name: "Krenko" },
          { cardId: "esika", name: "Esika" },
        ],
      })
    );
    expect(ada.zones.library).toHaveLength(98);
    expect(ada.zones.command).toHaveLength(2);
  });

  it("rejects junk payloads", () => {
    const { game, ctx, ada } = setup();
    mustFail(act(game, ctx, ada, { type: "SET_COMMANDER", cards: [] }), "bad commander count");
    mustFail(
      act(game, ctx, ada, {
        type: "SET_COMMANDER",
        cards: [
          { cardId: "a", name: "A" },
          { cardId: "b", name: "B" },
          { cardId: "c", name: "C" },
        ],
      }),
      "bad commander count"
    );
    mustFail(
      act(game, ctx, ada, { type: "SET_COMMANDER", cards: [{ cardId: "", name: "X" }] }),
      "bad commander"
    );
    mustFail(
      act(game, ctx, ada, {
        type: "SET_COMMANDER",
        cards: [
          { cardId: "a", name: "A" },
          { cardId: "a", name: "A" },
        ],
      }),
      "duplicate"
    );
  });

  it("a commander leaving the battlefield survives — it is not a token", () => {
    const { game, ctx, ada, bob } = setup();
    mustOk(
      act(game, ctx, ada, {
        type: "SET_COMMANDER",
        cards: [{ cardId: "cmd-atarxa", name: "Atraxa" }],
      })
    );
    mustOk(
      act(game, ctx, bob, { type: "SET_COMMANDER", cards: [{ cardId: "cmd-bob", name: "Ragavan" }] })
    );
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

  it("shows both commanders to everyone via the public command zone", () => {
    const { game, ctx, ada, bob } = setup();
    mustOk(
      act(game, ctx, ada, {
        type: "SET_COMMANDER",
        cards: [
          { cardId: "cmd-1", name: "Krenko" },
          { cardId: "cmd-2", name: "Esika" },
        ],
      })
    );
    const bobView = personalize(game, bob.id);
    const adaFromBob = bobView.players.find((p) => p.id === ada.id);
    if (adaFromBob?.zones.command.kind !== "cards") throw new Error("expected cards");
    expect(adaFromBob.zones.command.cards.map((c) => c.cardId)).toEqual(["cmd-1", "cmd-2"]);
    expect(bobView.format).toBe("freeform");
  });
});
