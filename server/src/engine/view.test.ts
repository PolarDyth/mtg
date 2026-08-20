// Hidden-information tests for view.ts's personalized snapshots.

import { describe, expect, it } from "vitest";
import { act, mustOk, setup, startWithDeck, uidAt } from "./actions/testUtils";
import { personalize } from "./view";

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

describe("host in views", () => {
  it("views expose the host", () => {
    const { game, ctx, ada } = setup();
    startWithDeck(game, ctx, ada);
    expect(personalize(game, ada.id).hostId).toBe(ada.id);
  });
});
