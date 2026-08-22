// Hidden-information tests for view.ts's personalized snapshots.

import { describe, expect, it } from "vitest";
import { act, mustOk, setup, startWithDeck, uidAt } from "./actions/testUtils";
import { addPlayer, makePlayer } from "./state";
import { personalize } from "./view";

describe("personalized snapshots", () => {
  it("hides opponents' hand/library/sideboard but shows counts", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada); // opening hand of 7 auto-drawn
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 5 })); // hand now 12

    const bobView = personalize(game, bob.id);
    const adaFromBob = bobView.players.find((p) => p.id === ada.id);
    expect(adaFromBob?.zones.hand).toEqual({ kind: "count", count: 12 });
    expect(adaFromBob?.zones.library).toEqual({ kind: "count", count: 28 });
    expect(adaFromBob?.zones.sideboard).toEqual({ kind: "count", count: 15 });

    const adaView = personalize(game, ada.id);
    const self = adaView.players.find((p) => p.id === ada.id);
    expect(self?.zones.hand.kind).toBe("cards");
    if (self?.zones.hand.kind === "cards") {
      expect(self.zones.hand.cards).toHaveLength(12);
      expect(self.zones.hand.cards.every((c) => c.cardId !== null)).toBe(true);
    }
  });

  it("exposes the current phase to every viewer", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    expect(personalize(game, bob.id).phase).toBe("untap");
    mustOk(act(game, ctx, ada, { type: "SET_PHASE", phase: "main2" }));
    expect(personalize(game, bob.id).phase).toBe("main2");
    expect(personalize(game, ada.id).phase).toBe("main2");
  });

  it("exposes the turn counter and start stamp to every viewer", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    mustOk(act(game, ctx, ada, { type: "NEXT_TURN" }));
    expect(personalize(game, bob.id).turnNumber).toBe(2);
    expect(personalize(game, ada.id).turnNumber).toBe(2);
    expect(personalize(game, bob.id).startedAt).toBe(1_000);
  });

  it("exposes every player's mana pool to every viewer", () => {
    const { game, ctx, ada, bob } = setup();
    mustOk(act(game, ctx, ada, { type: "SET_MANA", mana: { W: 2, C: 1 } }));
    const poolOf = (viewer: string, who: string) =>
      personalize(game, viewer).players.find((p) => p.id === who)?.mana;
    expect(poolOf(bob.id, ada.id)).toEqual({ W: 2, U: 0, B: 0, R: 0, G: 0, C: 1 });
    expect(poolOf(ada.id, ada.id)).toEqual({ W: 2, U: 0, B: 0, R: 0, G: 0, C: 1 });
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

  it("passes the transform face flag through to every viewer", () => {
    const { game, ctx, ada, bob } = setup();
    startWithDeck(game, ctx, ada);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 1 }));
    const uid = uidAt(ada.zones.hand, 0);
    mustOk(act(game, ctx, ada, { type: "MOVE_CARD", uid, to: "battlefield" }));
    mustOk(
      act(game, ctx, ada, { type: "TRANSFORM_CARD", uid, name: "Insectile Aberration" })
    );

    const faceOf = (viewer: string) => {
      const view = personalize(game, viewer).players.find((p) => p.id === ada.id);
      if (view?.zones.battlefield.kind !== "cards") throw new Error("expected cards");
      return view.zones.battlefield.cards[0]?.showBack;
    };
    expect(faceOf(ada.id)).toBe(true);
    expect(faceOf(bob.id)).toBe(true); // public — opponents render the same face
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
  it("targeted reveal chat reaches only the revealer and chosen players", () => {
    const { game, ctx, ada, bob } = setup();
    const cal = makePlayer(game, "Cal", "tok-cal", ctx.rng);
    addPlayer(game, cal);
    startWithDeck(game, ctx, ada);
    mustOk(act(game, ctx, ada, { type: "DRAW_CARDS", count: 1 }));
    const uid = uidAt(ada.zones.hand, 0);
    mustOk(
      act(game, ctx, ada, {
        type: "REVEAL_CARDS",
        cards: [{ uid, name: "X" }],
        to: [bob.id],
      })
    );
    mustOk(act(game, ctx, ada, { type: "REVEAL_CARDS", cards: [{ uid, name: "X" }] }));

    const revealsOf = (viewer: string) =>
      personalize(game, viewer).chat.filter((m) => m.kind === "reveal");
    expect(revealsOf(ada.id)).toHaveLength(2); // revealer sees both
    expect(revealsOf(bob.id)).toHaveLength(2); // target sees both
    expect(revealsOf(cal.id)).toHaveLength(1); // outsider sees only the broadcast
    const outsiderReveal = revealsOf(cal.id)[0];
    if (outsiderReveal?.kind !== "reveal") throw new Error("expected reveal");
    expect(outsiderReveal.to).toBeUndefined();
  });
});

describe("host in views", () => {
  it("views expose the host", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada);
    expect(personalize(game, ada.id).hostId).toBe(ada.id);
  });

  it("server-private fields (creatorIp, tokens, IPs, ban list) never reach a view", () => {
    const { game, ada } = setup();
    game.creatorIp = "203.0.113.7";
    const json = JSON.stringify(personalize(game, ada.id));
    expect(json).not.toContain("creatorIp");
    expect(json).not.toContain("203.0.113.7");
    expect(json).not.toContain("tok-"); // player rejoin tokens
    expect(json).not.toContain('"banned"');
  });
});

describe("arrows in views", () => {
  it("arrows are public — identical for every viewer", () => {
    const { game, ctx, ada, bob, adaUid, bobUid } = (() => {
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
    })();
    mustOk(
      act(game, ctx, ada, { type: "DRAW_ARROW", fromUid: adaUid, to: { uid: bobUid } })
    );
    mustOk(
      act(game, ctx, bob, { type: "DRAW_ARROW", fromUid: bobUid, to: { playerId: ada.id } })
    );
    expect(personalize(game, ada.id).arrows).toEqual(game.arrows);
    expect(personalize(game, bob.id).arrows).toEqual(game.arrows);
  });
});
