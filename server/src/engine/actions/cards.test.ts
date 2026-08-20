// Battlefield card-state tests: flags, counters, position, attachments,
// tokens.

import { describe, expect, it } from "vitest";
import type { Ctx } from "./internal";
import type { Game, Player } from "../state";
import { act, mustFail, mustOk, setup, startWithDeck, uidAt } from "./testUtils";

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

describe("CREATE_TOKEN", () => {
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
    expect(tokens.every((c) => c.annotations[0] === "¶Goblin")).toBe(true);
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
});
