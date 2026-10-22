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

describe("TRANSFORM_CARD", () => {
  function playOne(): { game: Game; ctx: Ctx; ada: Player; bob: Player; uid: string } {
    const s = setup();
    startWithDeck(s.game, s.ctx, s.ada);
    mustOk(act(s.game, s.ctx, s.ada, { type: "DRAW_CARDS", count: 1 }));
    const uid = uidAt(s.ada.zones.hand, 0);
    mustOk(act(s.game, s.ctx, s.ada, { type: "MOVE_CARD", uid, to: "battlefield" }));
    return { ...s, uid };
  }

  it("toggles the showing face and announces the target name", () => {
    const { game, ctx, ada, uid } = playOne();
    mustOk(
      act(game, ctx, ada, { type: "TRANSFORM_CARD", uid, name: "Insectile Aberration" })
    );
    expect(ada.zones.battlefield[0]?.showBack).toBe(true);
    const last = game.chat.at(-1);
    if (last?.kind !== "system") throw new Error("expected system message");
    expect(last.text).toContain("transforms into Insectile Aberration");

    mustOk(
      act(game, ctx, ada, { type: "TRANSFORM_CARD", uid, name: "Delver of Secrets" })
    );
    expect(ada.zones.battlefield[0]?.showBack).toBe(false);
  });

  it("keeps counters, position, tapped, and attachments through the swap", () => {
    const s = setup();
    startWithDeck(s.game, s.ctx, s.ada);
    mustOk(act(s.game, s.ctx, s.ada, { type: "DRAW_CARDS", count: 2 }));
    const host = uidAt(s.ada.zones.hand, 0);
    const dfc = uidAt(s.ada.zones.hand, 1);
    mustOk(act(s.game, s.ctx, s.ada, { type: "MOVE_CARD", uid: host, to: "battlefield" }));
    mustOk(act(s.game, s.ctx, s.ada, { type: "MOVE_CARD", uid: dfc, to: "battlefield" }));
    mustOk(act(s.game, s.ctx, s.ada, { type: "ATTACH_CARD", uid: host, to: dfc }));
    mustOk(
      act(s.game, s.ctx, s.ada, {
        type: "SET_COUNTERS",
        uid: dfc,
        counters: { "+1/+1": 2 },
      })
    );
    mustOk(act(s.game, s.ctx, s.ada, { type: "SET_POSITION", uid: dfc, x: 30, y: 70 }));
    mustOk(act(s.game, s.ctx, s.ada, { type: "SET_TAPPED", uid: dfc, value: true }));

    mustOk(
      act(s.game, s.ctx, s.ada, { type: "TRANSFORM_CARD", uid: dfc, name: "Back Face" })
    );
    const card = s.ada.zones.battlefield.find((c) => c.uid === dfc);
    expect(card?.showBack).toBe(true);
    expect(card?.counters["+1/+1"]).toBe(2);
    expect(card?.x).toBe(30);
    expect(card?.y).toBe(70);
    expect(card?.tapped).toBe(true);
    expect(card?.attachedTo).toBeUndefined();
    // the aura attached TO the transformed card stays attached
    expect(s.ada.zones.battlefield.find((c) => c.uid === host)?.attachedTo).toBe(dfc);
  });

  it("works in any zone — a transformed card dying isn't stuck", () => {
    const s = setup();
    startWithDeck(s.game, s.ctx, s.ada);
    mustOk(act(s.game, s.ctx, s.ada, { type: "DRAW_CARDS", count: 1 }));
    const uid = uidAt(s.ada.zones.hand, 0);
    mustOk(
      act(s.game, s.ctx, s.ada, { type: "TRANSFORM_CARD", uid, name: "Other Side" })
    );
    expect(s.ada.zones.hand[0]?.showBack).toBe(true);
    mustOk(
      act(s.game, s.ctx, s.ada, { type: "TRANSFORM_CARD", uid, name: "Front" })
    );
    expect(s.ada.zones.hand[0]?.showBack).toBe(false);
  });

  it("rejects junk names and other players' cards", () => {
    const { game, ctx, ada, bob, uid } = playOne();
    mustFail(
      act(game, ctx, ada, { type: "TRANSFORM_CARD", uid, name: "   " }),
      "bad transform name"
    );
    mustFail(
      act(game, ctx, ada, { type: "TRANSFORM_CARD", uid, name: "x".repeat(65) }),
      "bad transform name"
    );
    mustFail(
      act(game, ctx, bob, { type: "TRANSFORM_CARD", uid, name: "Back" }),
      "not found"
    );
  });
});

describe("ATTACH_CARD", () => {
  function playTwo(): { game: Game; ctx: Ctx; ada: Player; a: string; b: string } {
    const s = setup();
    startWithDeck(s.game, s.ctx, s.ada);
    mustOk(act(s.game, s.ctx, s.ada, { type: "DRAW_CARDS", count: 2 }));
    const a = uidAt(s.ada.zones.hand, 0);
    const b = uidAt(s.ada.zones.hand, 1);
    mustOk(act(s.game, s.ctx, s.ada, { type: "MOVE_CARD", uid: a, to: "battlefield" }));
    mustOk(act(s.game, s.ctx, s.ada, { type: "MOVE_CARD", uid: b, to: "battlefield" }));
    return { ...s, a, b };
  }

  it("attaches and detaches", () => {
    const { game, ctx, ada, a, b } = playTwo();
    mustOk(act(game, ctx, ada, { type: "ATTACH_CARD", uid: b, to: a }));
    expect(ada.zones.battlefield.find((c) => c.uid === b)?.attachedTo).toBe(a);
    mustOk(act(game, ctx, ada, { type: "ATTACH_CARD", uid: b, to: null }));
    expect(ada.zones.battlefield.find((c) => c.uid === b)?.attachedTo).toBeUndefined();
  });

  it("moving an attached card (SET_POSITION) detaches it", () => {
    const { game, ctx, ada, a, b } = playTwo();
    mustOk(act(game, ctx, ada, { type: "ATTACH_CARD", uid: b, to: a }));
    mustOk(act(game, ctx, ada, { type: "SET_POSITION", uid: b, x: 20, y: 30 }));
    const moved = ada.zones.battlefield.find((c) => c.uid === b);
    expect(moved?.attachedTo).toBeUndefined();
    expect(moved?.x).toBe(20);
    expect(moved?.y).toBe(30);
  });

  it("moving the host keeps its followers attached", () => {
    const { game, ctx, ada, a, b } = playTwo();
    mustOk(act(game, ctx, ada, { type: "ATTACH_CARD", uid: b, to: a }));
    mustOk(act(game, ctx, ada, { type: "SET_POSITION", uid: a, x: 75, y: 25 }));
    expect(ada.zones.battlefield.find((c) => c.uid === b)?.attachedTo).toBe(a);
    expect(ada.zones.battlefield.find((c) => c.uid === a)?.attachedTo).toBeUndefined();
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

  it("stacks the newest attachment behind the older one", () => {
    const s = setup();
    startWithDeck(s.game, s.ctx, s.ada);
    mustOk(act(s.game, s.ctx, s.ada, { type: "DRAW_CARDS", count: 3 }));
    const host = uidAt(s.ada.zones.hand, 0);
    const first = uidAt(s.ada.zones.hand, 1);
    const second = uidAt(s.ada.zones.hand, 2);
    for (const uid of [host, first, second]) {
      mustOk(act(s.game, s.ctx, s.ada, { type: "MOVE_CARD", uid, to: "battlefield" }));
    }
    mustOk(act(s.game, s.ctx, s.ada, { type: "ATTACH_CARD", uid: first, to: host }));
    mustOk(act(s.game, s.ctx, s.ada, { type: "ATTACH_CARD", uid: second, to: host }));
    // Attach order — not battlefield entry order — decides the stack: the
    // newest follower leads the array (innermost cascade slot, painted
    // first), the oldest keeps the outer/top slot just under the host.
    const bf = s.ada.zones.battlefield;
    const at = (uid: string) => bf.findIndex((c) => c.uid === uid);
    expect(at(second)).toBeLessThan(at(first));
    expect(at(first)).toBeLessThan(at(host));
  });

  it("detaching restores loose board order with the card on top", () => {
    const s = setup();
    startWithDeck(s.game, s.ctx, s.ada);
    mustOk(act(s.game, s.ctx, s.ada, { type: "DRAW_CARDS", count: 3 }));
    const host = uidAt(s.ada.zones.hand, 0);
    const first = uidAt(s.ada.zones.hand, 1);
    const second = uidAt(s.ada.zones.hand, 2);
    for (const uid of [host, first, second]) {
      mustOk(act(s.game, s.ctx, s.ada, { type: "MOVE_CARD", uid, to: "battlefield" }));
    }
    mustOk(act(s.game, s.ctx, s.ada, { type: "ATTACH_CARD", uid: first, to: host }));
    mustOk(act(s.game, s.ctx, s.ada, { type: "ATTACH_CARD", uid: second, to: host }));
    mustOk(act(s.game, s.ctx, s.ada, { type: "ATTACH_CARD", uid: second, to: null }));
    const bf = s.ada.zones.battlefield;
    expect(bf.at(-1)?.uid).toBe(second);
    expect(bf.find((c) => c.uid === first)?.attachedTo).toBe(host);
    expect(bf.find((c) => c.uid === second)?.attachedTo).toBeUndefined();
  });

  it("dragging a follower off (SET_POSITION) detaches and reorders", () => {
    const s = setup();
    startWithDeck(s.game, s.ctx, s.ada);
    mustOk(act(s.game, s.ctx, s.ada, { type: "DRAW_CARDS", count: 2 }));
    const host = uidAt(s.ada.zones.hand, 0);
    const follower = uidAt(s.ada.zones.hand, 1);
    mustOk(act(s.game, s.ctx, s.ada, { type: "MOVE_CARD", uid: host, to: "battlefield" }));
    mustOk(act(s.game, s.ctx, s.ada, { type: "MOVE_CARD", uid: follower, to: "battlefield" }));
    mustOk(act(s.game, s.ctx, s.ada, { type: "ATTACH_CARD", uid: follower, to: host }));
    mustOk(
      act(s.game, s.ctx, s.ada, { type: "SET_POSITION", uid: follower, x: 20, y: 30 })
    );
    const bf = s.ada.zones.battlefield;
    expect(bf.at(-1)?.uid).toBe(follower);
    expect(bf.find((c) => c.uid === follower)?.attachedTo).toBeUndefined();
  });
});

describe("GIVE_CONTROL", () => {
  function playOne(): { game: Game; ctx: Ctx; ada: Player; bob: Player; uid: string } {
    const s = setup();
    startWithDeck(s.game, s.ctx, s.ada);
    mustOk(act(s.game, s.ctx, s.ada, { type: "DRAW_CARDS", count: 1 }));
    const uid = uidAt(s.ada.zones.hand, 0);
    mustOk(act(s.game, s.ctx, s.ada, { type: "MOVE_CARD", uid, to: "battlefield" }));
    return { ...s, uid };
  }

  it("moves a battlefield card to another player's battlefield", () => {
    const { game, ctx, ada, bob, uid } = playOne();
    mustOk(act(game, ctx, ada, { type: "GIVE_CONTROL", uid, toPlayerId: bob.id }));
    expect(ada.zones.battlefield.find((c) => c.uid === uid)).toBeUndefined();
    expect(bob.zones.battlefield.find((c) => c.uid === uid)).toBeDefined();
  });

  it("detaches both sides of attachment links when control changes", () => {
    const s = setup();
    startWithDeck(s.game, s.ctx, s.ada);
    mustOk(act(s.game, s.ctx, s.ada, { type: "DRAW_CARDS", count: 2 }));
    const host = uidAt(s.ada.zones.hand, 0);
    const follower = uidAt(s.ada.zones.hand, 1);
    mustOk(act(s.game, s.ctx, s.ada, { type: "MOVE_CARD", uid: host, to: "battlefield" }));
    mustOk(act(s.game, s.ctx, s.ada, { type: "MOVE_CARD", uid: follower, to: "battlefield" }));
    mustOk(act(s.game, s.ctx, s.ada, { type: "ATTACH_CARD", uid: follower, to: host }));
    mustOk(
      act(s.game, s.ctx, s.ada, { type: "GIVE_CONTROL", uid: host, toPlayerId: s.bob.id })
    );
    expect(s.bob.zones.battlefield.find((c) => c.uid === host)?.attachedTo).toBeUndefined();
    expect(s.ada.zones.battlefield.find((c) => c.uid === follower)?.attachedTo).toBeUndefined();
  });

  it("rejects non-battlefield cards, unknown players, and other players' cards", () => {
    const { game, ctx, ada, bob, uid } = playOne();
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 1 }));
    const handUid = uidAt(ada.zones.hand, 0);
    mustFail(
      act(game, ctx, ada, { type: "GIVE_CONTROL", uid: handUid, toPlayerId: bob.id }),
      "battlefield"
    );
    mustFail(
      act(game, ctx, ada, { type: "GIVE_CONTROL", uid, toPlayerId: "ghost" }),
      "target player"
    );
    mustFail(
      act(game, ctx, bob, { type: "GIVE_CONTROL", uid, toPlayerId: bob.id }),
      "card not found"
    );
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

  it("caps total battlefield cards — boundary is inclusive, zone untouched on reject", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada);
    // 12 × 20 = 240, then 9 more = 249 (one under the cap of 250)
    for (let i = 0; i < 12; i++) {
      mustOk(act(game, ctx, ada, { type: "CREATE_TOKEN", name: "Goblin", count: 20 }));
    }
    mustOk(act(game, ctx, ada, { type: "CREATE_TOKEN", name: "Goblin", count: 9 }));
    expect(ada.zones.battlefield).toHaveLength(249);

    mustOk(act(game, ctx, ada, { type: "CREATE_TOKEN", name: "Goblin", count: 1 }));
    expect(ada.zones.battlefield).toHaveLength(250);

    mustFail(
      act(game, ctx, ada, { type: "CREATE_TOKEN", name: "Goblin", count: 1 }),
      "battlefield is full"
    );
    expect(ada.zones.battlefield).toHaveLength(250); // unchanged on failure
  });
});

describe("DRAW_ARROW / CLEAR_ARROWS", () => {
  /** Both players with one battlefield card each. */
  function playTwo(): {
    game: Game;
    ctx: Ctx;
    ada: Player;
    bob: Player;
    adaUid: string;
    bobUid: string;
  } {
    const s = setup();
    startWithDeck(s.game, s.ctx, s.ada);
    mustOk(
      act(s.game, s.ctx, s.bob, {
        type: "LOAD_DECK",
        library: [{ cardId: "bob-card", count: 5 }],
        sideboard: [],
      })
    );
    mustOk(act(s.game, s.ctx, s.ada, { type: "DRAW_CARDS", count: 1 }));
    mustOk(act(s.game, s.ctx, s.bob, { type: "DRAW_CARDS", count: 1 }));
    const adaUid = uidAt(s.ada.zones.hand, 0);
    const bobUid = uidAt(s.bob.zones.hand, 0);
    mustOk(act(s.game, s.ctx, s.ada, { type: "MOVE_CARD", uid: adaUid, to: "battlefield" }));
    mustOk(act(s.game, s.ctx, s.bob, { type: "MOVE_CARD", uid: bobUid, to: "battlefield" }));
    return { ...s, adaUid, bobUid };
  }

  it("draws card→card and card→player arrows", () => {
    const { game, ctx, ada, bob, adaUid, bobUid } = playTwo();
    mustOk(
      act(game, ctx, ada, { type: "DRAW_ARROW", fromUid: adaUid, to: { uid: bobUid } })
    );
    mustOk(
      act(game, ctx, bob, { type: "DRAW_ARROW", fromUid: bobUid, to: { playerId: ada.id } })
    );
    expect(game.arrows).toHaveLength(2);
    expect(game.arrows[0]).toMatchObject({
      playerId: ada.id,
      fromUid: adaUid,
      to: { uid: bobUid },
      at: 1_000,
    });
    expect(game.arrows[1]?.to).toEqual({ playerId: ada.id });
  });

  it("redrawing from the same card replaces the author's arrow; other authors stack", () => {
    const { game, ctx, ada, bob, adaUid, bobUid } = playTwo();
    mustOk(
      act(game, ctx, ada, { type: "DRAW_ARROW", fromUid: adaUid, to: { uid: bobUid } })
    );
    mustOk(
      act(game, ctx, ada, {
        type: "DRAW_ARROW",
        fromUid: adaUid,
        to: { playerId: bob.id },
      })
    );
    expect(game.arrows).toHaveLength(1);
    expect(game.arrows[0]?.to).toEqual({ playerId: bob.id });
    // a different author may arrow from the same card
    mustOk(
      act(game, ctx, bob, { type: "DRAW_ARROW", fromUid: adaUid, to: { uid: bobUid } })
    );
    expect(game.arrows).toHaveLength(2);
  });

  it("rejects arrows whose endpoints are not on the battlefield", () => {
    const { game, ctx, ada, adaUid, bobUid } = playTwo();
    // a hand card can be a target's stand-in for "not on battlefield"
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 1 }));
    const handUid = uidAt(ada.zones.hand, 0);
    mustFail(
      act(game, ctx, ada, { type: "DRAW_ARROW", fromUid: handUid, to: { uid: bobUid } }),
      "source card"
    );
    mustFail(
      act(game, ctx, ada, { type: "DRAW_ARROW", fromUid: adaUid, to: { uid: handUid } }),
      "target card"
    );
    mustFail(
      act(game, ctx, ada, { type: "DRAW_ARROW", fromUid: adaUid, to: { playerId: "ghost" } }),
      "player"
    );
    mustFail(
      act(game, ctx, ada, { type: "DRAW_ARROW", fromUid: adaUid, to: { uid: adaUid } }),
      "own card"
    );
  });

  it("caps the table at 40 arrows", () => {
    const { game, ctx, ada, bob, adaUid, bobUid } = playTwo();
    mustOk(
      act(game, ctx, ada, { type: "CREATE_TOKEN", name: "Goblin", count: 20 })
    );
    mustOk(
      act(game, ctx, ada, { type: "CREATE_TOKEN", name: "Goblin", count: 20 })
    );
    const sources = ada.zones.battlefield.map((c) => c.uid).filter((u) => u !== adaUid);
    expect(sources.length).toBeGreaterThanOrEqual(40);
    for (let i = 0; i < 40; i++) {
      mustOk(
        act(game, ctx, ada, { type: "DRAW_ARROW", fromUid: sources[i]!, to: { uid: bobUid } })
      );
    }
    expect(game.arrows).toHaveLength(40);
    mustFail(
      act(game, ctx, ada, { type: "DRAW_ARROW", fromUid: adaUid, to: { uid: bobUid } }),
      "too many arrows"
    );
    // but replacing an existing arrow at the cap still works
    mustOk(
      act(game, ctx, ada, { type: "DRAW_ARROW", fromUid: sources[0]!, to: { uid: bobUid } })
    );
    expect(game.arrows).toHaveLength(40);
  });

  it("clears by id, by author, or all; unknown ids error", () => {
    const { game, ctx, ada, bob, adaUid, bobUid } = playTwo();
    mustOk(
      act(game, ctx, ada, { type: "DRAW_ARROW", fromUid: adaUid, to: { uid: bobUid } })
    );
    mustOk(
      act(game, ctx, bob, { type: "DRAW_ARROW", fromUid: bobUid, to: { uid: adaUid } })
    );
    mustOk(
      act(game, ctx, ada, { type: "DRAW_ARROW", fromUid: bobUid, to: { uid: adaUid } })
    );
    const [first] = game.arrows;
    mustFail(
      act(game, ctx, ada, { type: "CLEAR_ARROWS", id: "nope" }),
      "not found"
    );
    mustOk(act(game, ctx, bob, { type: "CLEAR_ARROWS", id: first!.id }));
    expect(game.arrows).toHaveLength(2);
    mustOk(act(game, ctx, ada, { type: "CLEAR_ARROWS", playerId: bob.id }));
    expect(game.arrows).toHaveLength(1); // the survivor is Ada's
    mustOk(act(game, ctx, bob, { type: "CLEAR_ARROWS" }));
    expect(game.arrows).toHaveLength(0);
  });

  it("prunes arrows when their endpoint cards leave the battlefield", () => {
    const { game, ctx, ada, adaUid, bobUid } = playTwo();
    mustOk(
      act(game, ctx, ada, { type: "DRAW_ARROW", fromUid: adaUid, to: { uid: bobUid } })
    );
    mustOk(
      act(game, ctx, ada, { type: "DRAW_ARROW", fromUid: bobUid, to: { uid: adaUid } })
    );
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid: adaUid, to: "graveyard" }));
    expect(game.arrows).toHaveLength(0);
  });

  it("prunes card→player arrows when the target player leaves", () => {
    const { game, ctx, ada, bob, adaUid } = playTwo();
    mustOk(
      act(game, ctx, ada, { type: "DRAW_ARROW", fromUid: adaUid, to: { playerId: bob.id } })
    );
    mustOk(act(game, ctx, bob, { type: "LEAVE_GAME" }));
    expect(game.arrows).toHaveLength(0);
  });

  it("clears all arrows when the turn passes or the game ends", () => {
    const { game, ctx, ada, adaUid, bobUid } = playTwo();
    mustOk(
      act(game, ctx, ada, { type: "DRAW_ARROW", fromUid: adaUid, to: { uid: bobUid } })
    );
    mustOk(act(game, ctx, ada, { type: "NEXT_TURN" }));
    expect(game.arrows).toHaveLength(0);
    mustOk(
      act(game, ctx, ada, { type: "DRAW_ARROW", fromUid: adaUid, to: { uid: bobUid } })
    );
    mustOk(act(game, ctx, ada, { type: "END_GAME" }));
    expect(game.arrows).toHaveLength(0);
  });
});

describe("chat naming for card state", () => {
  /** One of Ada's cards on the battlefield, one still in hand. */
  function playOne(): { game: Game; ctx: Ctx; ada: Player; bob: Player; uid: string } {
    const s = setup();
    startWithDeck(s.game, s.ctx, s.ada);
    mustOk(act(s.game, s.ctx, s.ada, { type: "DRAW_CARDS", count: 2 }));
    const uid = uidAt(s.ada.zones.hand, 0);
    mustOk(
      act(s.game, s.ctx, s.ada, {
        type: "MOVE_CARD",
        uid,
        to: "battlefield",
        name: "Lightning Bolt",
      })
    );
    return { ...s, uid };
  }

  function lastSystem(s: { game: Game }): string {
    const last = s.game.chat.at(-1);
    if (last?.kind !== "system") throw new Error("expected system message");
    return last.text;
  }

  it("counters announce kind, count, and card name; unchanged re-sets stay silent", () => {
    const { game, ctx, ada, uid } = playOne();
    mustOk(
      act(game, ctx, ada, { type: "SET_COUNTERS", uid, counters: { "+1/+1": 2 }, name: "Lightning Bolt" })
    );
    expect(lastSystem({ game })).toBe("Ada sets +1/+1×2 on Lightning Bolt");
    const chatLen = game.chat.length;
    mustOk(
      act(game, ctx, ada, { type: "SET_COUNTERS", uid, counters: { "+1/+1": 2 }, name: "Lightning Bolt" })
    );
    expect(game.chat).toHaveLength(chatLen);
    mustOk(act(game, ctx, ada, { type: "SET_COUNTERS", uid, counters: {}, name: "Lightning Bolt" }));
    expect(lastSystem({ game })).toBe("Ada sets +1/+1 removed on Lightning Bolt");
  });

  it("repositions announce the card name", () => {
    const { game, ctx, ada, uid } = playOne();
    mustOk(act(game, ctx, ada, { type: "SET_POSITION", uid, x: 20, y: 30, name: "Lightning Bolt" }));
    expect(lastSystem({ game })).toBe("Ada repositions Lightning Bolt");
  });

  it("attaching and detaching announce both ends, with a fallback host label", () => {
    const { game, ctx, ada, uid } = playOne();
    const aura = uidAt(ada.zones.hand, 0);
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid: aura, to: "battlefield" }));
    mustOk(
      act(game, ctx, ada, { type: "ATTACH_CARD", uid: aura, to: uid, name: "Rancor", toName: "Lightning Bolt" })
    );
    expect(lastSystem({ game })).toBe("Ada attaches Rancor to Lightning Bolt");
    mustOk(act(game, ctx, ada, { type: "ATTACH_CARD", uid: aura, to: null, name: "Rancor" }));
    expect(lastSystem({ game })).toBe("Ada detaches Rancor");
    mustOk(act(game, ctx, ada, { type: "ATTACH_CARD", uid: aura, to: uid, name: "Rancor" }));
    expect(lastSystem({ game })).toBe("Ada attaches Rancor to another card");
  });

  it("face-down flips announce without a name; idempotent flips stay silent", () => {
    const { game, ctx, ada, uid } = playOne();
    mustOk(act(game, ctx, ada, { type: "SET_FACE_DOWN", uid, value: true }));
    expect(lastSystem({ game })).toBe("Ada sets a card face down");
    const chatLen = game.chat.length;
    mustOk(act(game, ctx, ada, { type: "SET_FACE_DOWN", uid, value: true }));
    expect(game.chat).toHaveLength(chatLen);
    mustOk(act(game, ctx, ada, { type: "SET_FACE_DOWN", uid, value: false }));
    expect(lastSystem({ game })).toBe("Ada sets a card face up");
  });

  it("giving control announces the card and the new controller", () => {
    const { game, ctx, ada, bob, uid } = playOne();
    mustOk(
      act(game, ctx, ada, { type: "GIVE_CONTROL", uid, toPlayerId: bob.id, name: "Lightning Bolt" })
    );
    expect(lastSystem({ game })).toBe("Ada gives control of Lightning Bolt to Bob");
  });
});
