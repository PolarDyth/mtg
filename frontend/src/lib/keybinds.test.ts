import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEYBINDS,
  eventToCombo,
  isTypingTarget,
  matchKeybind,
  SHORTCUT_GROUPS,
  type KeybindId,
} from "./keybinds";

type FakeEvent = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
};

function combo(e: FakeEvent) {
  return eventToCombo({
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...e,
  });
}

function id(e: FakeEvent) {
  return matchKeybind({
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...e,
  });
}

describe("eventToCombo", () => {
  it("normalizes letters, Enter and F-keys", () => {
    expect(combo({ key: "d", ctrlKey: true })).toBe("Ctrl+D");
    expect(combo({ key: "D", ctrlKey: true, shiftKey: true })).toBe("Ctrl+Shift+D");
    expect(combo({ key: "Enter", ctrlKey: true })).toBe("Ctrl+Enter");
    expect(combo({ key: "F3" })).toBe("F3");
    expect(combo({ key: "F3", ctrlKey: true })).toBe("Ctrl+F3");
  });

  it("treats meta (⌘) as Ctrl", () => {
    expect(combo({ key: "d", metaKey: true })).toBe("Ctrl+D");
    expect(combo({ key: "Enter", metaKey: true })).toBe("Ctrl+Enter");
  });

  it("combines Ctrl+Alt and maps = / - bases", () => {
    expect(combo({ key: "t", ctrlKey: true, altKey: true })).toBe("Ctrl+Alt+T");
    expect(combo({ key: "=", ctrlKey: true, altKey: true })).toBe("Ctrl+Alt+=");
    expect(combo({ key: "-", ctrlKey: true, altKey: true })).toBe("Ctrl+Alt+-");
  });

  it("returns null for bare modifiers and unbindable keys", () => {
    expect(combo({ key: "Control", ctrlKey: true })).toBeNull();
    expect(combo({ key: "Shift", shiftKey: true })).toBeNull();
    expect(combo({ key: "Tab" })).toBeNull();
    expect(combo({ key: "ArrowLeft" })).toBeNull();
  });
});

describe("default keybind matching", () => {
  it("maps Cockatrice-style defaults", () => {
    expect(id({ key: "d", ctrlKey: true })).toBe("drawOne");
    expect(id({ key: "e", ctrlKey: true })).toBe("drawMany");
    expect(id({ key: "Enter", ctrlKey: true })).toBe("nextTurn");
    expect(id({ key: "u", ctrlKey: true })).toBe("untapAll");
    expect(id({ key: "s", ctrlKey: true })).toBe("shuffleLibrary");
    expect(id({ key: "y", altKey: true })).toBe("millOne");
    expect(id({ key: "m", altKey: true })).toBe("millMany");
    expect(id({ key: "y", ctrlKey: true })).toBe("playTopCard");
    expect(id({ key: "r", ctrlKey: true })).toBe("removeMyArrows");
    expect(id({ key: "g", ctrlKey: true })).toBe("createAnotherToken");
    expect(id({ key: "a", ctrlKey: true })).toBe("selectAll");
    expect(id({ key: "F4" })).toBe("viewGraveyard");
  });

  it("requires the exact modifiers — no accidental plain-key matches", () => {
    expect(id({ key: "d" })).toBeNull();
    expect(id({ key: "f" })).toBeNull(); // plain F is not Alt+F (flip)
    expect(id({ key: "y" })).toBeNull();
    expect(id({ key: "Enter" })).toBeNull();
    expect(id({ key: "Delete" })).toBeNull(); // plain Delete is not Ctrl+Delete
    expect(id({ key: "n", altKey: true })).toBe("noteHover");
    expect(id({ key: "a", altKey: true })).toBe("arrowFromHover");
    expect(id({ key: "f", altKey: true })).toBe("flipHover");
    expect(id({ key: "b", ctrlKey: true })).toBe("bottomHover");
  });

  it("keeps remapped browser-reserved combos distinct", () => {
    expect(id({ key: "t", ctrlKey: true })).toBeNull(); // Ctrl+T would be a new tab
    expect(id({ key: "t", ctrlKey: true, altKey: true })).toBe("createToken");
    expect(id({ key: "w", ctrlKey: true })).toBeNull(); // Ctrl+W would close the tab
    expect(id({ key: "w", ctrlKey: true, altKey: true })).toBe("viewTopCards");
  });

  it("shift distinguishes chat focus from next turn", () => {
    expect(id({ key: "Enter", shiftKey: true })).toBe("focusChat");
    expect(id({ key: "Enter", ctrlKey: true })).toBe("nextTurn");
  });

  it("shift also distinguishes pass turn from next phase", () => {
    expect(id({ key: "Enter", ctrlKey: true, shiftKey: true })).toBe("passTurn");
    expect(id({ key: "Enter", metaKey: true, shiftKey: true })).toBe("passTurn");
  });

  it("binds the round-2 mechanics without disturbing older combos", () => {
    expect(id({ key: "d", ctrlKey: true, shiftKey: true })).toBe("randomDiscard");
    expect(id({ key: "p", altKey: true })).toBe("buffCreatures");
    expect(id({ key: "g", ctrlKey: true, altKey: true })).toBe("toggleGridSnap");
    // plain / sibling variants stay unbound or keep their old meaning
    expect(id({ key: "d", ctrlKey: true })).toBe("drawOne");
    expect(id({ key: "p" })).toBeNull();
    expect(id({ key: "g", ctrlKey: true })).toBe("createAnotherToken");
    expect(id({ key: "g" })).toBeNull();
  });

  it("binds the audited gaps: tap/attach hover, scry, surveil, mulligan", () => {
    expect(id({ key: "t", altKey: true })).toBe("tapHover");
    expect(id({ key: "h", altKey: true })).toBe("attachHover");
    expect(id({ key: "s", ctrlKey: true, altKey: true })).toBe("scry");
    expect(id({ key: "v", ctrlKey: true, altKey: true })).toBe("surveil");
    expect(id({ key: "m", ctrlKey: true, altKey: true })).toBe("mulligan");
    // sibling combos keep their meanings, plain variants stay unbound
    expect(id({ key: "s", ctrlKey: true })).toBe("shuffleLibrary");
    expect(id({ key: "m", altKey: true })).toBe("millMany");
    expect(id({ key: "t", ctrlKey: true, altKey: true })).toBe("createToken");
    expect(id({ key: "h" })).toBeNull();
    expect(id({ key: "v" })).toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("flags typing targets", () => {
    expect(isTypingTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(
      isTypingTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)
    ).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("DEFAULT_KEYBINDS sanity", () => {
  it("has no duplicate combos", () => {
    const combos = Object.values(DEFAULT_KEYBINDS);
    expect(new Set(combos).size).toBe(combos.length);
  });

  it("cheat-sheet groups cover every keybind exactly once", () => {
    const listed = SHORTCUT_GROUPS.flatMap((g) => g.items).sort();
    const all = (Object.keys(DEFAULT_KEYBINDS) as KeybindId[]).sort();
    expect(listed).toEqual(all);
  });
});
