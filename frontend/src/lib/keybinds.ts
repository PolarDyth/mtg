/**
 * Game keyboard shortcuts. Defaults mirror Cockatrice's
 * (cockatrice/src/client/settings/shortcuts_settings.h) wherever browsers
 * allow intercepting them. Combos are written "Ctrl+D" / "Alt+F" /
 * "Ctrl+Alt+T" / "F3" / "Ctrl+Delete" / "Shift+Enter" / "Ctrl+Alt+=" —
 * metaKey (⌘) counts as Ctrl. Remapped because browsers reserve them:
 * create token (Ctrl+T), look at top cards (Ctrl+W), life ±1 (F12/F11).
 */

export type KeybindId =
  | "drawOne"
  | "drawMany"
  | "mulligan"
  | "nextTurn"
  | "passTurn"
  | "untapAll"
  | "buffCreatures"
  | "clearManaPool"
  | "shuffleLibrary"
  | "rollDie"
  | "millOne"
  | "millMany"
  | "randomDiscard"
  | "playTopCard"
  | "viewLibrary"
  | "viewGraveyard"
  | "viewSideboard"
  | "viewTopCards"
  | "scry"
  | "surveil"
  | "createToken"
  | "createAnotherToken"
  | "removeMyArrows"
  | "lifeSet"
  | "lifeInc"
  | "lifeDec"
  | "focusChat"
  | "selectAll"
  | "toggleGridSnap"
  | "arrowFromHover"
  | "tapHover"
  | "attachHover"
  | "flipHover"
  | "graveyardHover"
  | "bottomHover"
  | "noteHover";

export const DEFAULT_KEYBINDS: Record<KeybindId, string> = {
  drawOne: "Ctrl+D",
  drawMany: "Ctrl+E",
  mulligan: "Ctrl+Alt+M",
  nextTurn: "Ctrl+Enter",
  passTurn: "Ctrl+Shift+Enter",
  untapAll: "Ctrl+U",
  buffCreatures: "Alt+P",
  clearManaPool: "Alt+C",
  shuffleLibrary: "Ctrl+S",
  rollDie: "Ctrl+I",
  millOne: "Alt+Y",
  millMany: "Alt+M",
  randomDiscard: "Ctrl+Shift+D",
  playTopCard: "Ctrl+Y",
  viewLibrary: "F3",
  viewGraveyard: "F4",
  viewSideboard: "Ctrl+F3",
  viewTopCards: "Ctrl+Alt+W",
  scry: "Ctrl+Alt+S",
  surveil: "Ctrl+Alt+V",
  createToken: "Ctrl+Alt+T",
  createAnotherToken: "Ctrl+G",
  removeMyArrows: "Ctrl+R",
  lifeSet: "Ctrl+L",
  lifeInc: "Ctrl+Alt+=",
  lifeDec: "Ctrl+Alt+-",
  focusChat: "Shift+Enter",
  selectAll: "Ctrl+A",
  toggleGridSnap: "Ctrl+Alt+G",
  arrowFromHover: "Alt+A",
  tapHover: "Alt+T",
  attachHover: "Alt+H",
  flipHover: "Alt+F",
  graveyardHover: "Ctrl+Delete",
  bottomHover: "Ctrl+B",
  noteHover: "Alt+N",
};

const COMBO_TO_ID: ReadonlyMap<string, KeybindId> = new Map(
  (Object.entries(DEFAULT_KEYBINDS) as [KeybindId, string][]).map(([id, combo]) => [
    combo,
    id,
  ])
);

/** Cheat-sheet labels for every bind (Record forces one label per id). */
export const KEYBIND_LABELS: Record<KeybindId, string> = {
  drawOne: "Draw a card",
  drawMany: "Draw cards…",
  mulligan: "Mulligan…",
  nextTurn: "Next phase / turn",
  passTurn: "Pass turn",
  untapAll: "Untap all permanents",
  buffCreatures: "+1/+1 on all my creatures",
  clearManaPool: "Clear my mana pool",
  shuffleLibrary: "Shuffle library",
  rollDie: "Roll a d20",
  millOne: "Mill 1 card",
  millMany: "Mill cards…",
  randomDiscard: "Discard 1 card at random",
  playTopCard: "Play top card to battlefield",
  viewLibrary: "View library",
  viewGraveyard: "View graveyard",
  viewSideboard: "View sideboard",
  viewTopCards: "Look at top N cards…",
  scry: "Scry…",
  surveil: "Surveil…",
  createToken: "Create a token…",
  createAnotherToken: "Create another token",
  removeMyArrows: "Remove my arrows",
  lifeSet: "Set life",
  lifeInc: "Life +1",
  lifeDec: "Life −1",
  focusChat: "Focus chat",
  selectAll: "Select all cards in hand",
  toggleGridSnap: "Toggle grid snapping",
  arrowFromHover: "Draw arrow from it",
  tapHover: "Tap / untap it",
  attachHover: "Attach it to another card…",
  flipHover: "Turn it face down / up",
  graveyardHover: "Put it in the graveyard",
  bottomHover: "Put it on the bottom of the library",
  noteHover: "Add a note to it",
};

/** Cheat-sheet section layout (presentation order); tests assert the
 *  groups cover every KeybindId exactly once. */
export const SHORTCUT_GROUPS: { title: string; items: KeybindId[] }[] = [
  {
    title: "Draw & library",
    items: [
      "drawOne",
      "drawMany",
      "mulligan",
      "playTopCard",
      "millOne",
      "millMany",
      "randomDiscard",
      "scry",
      "surveil",
      "shuffleLibrary",
      "viewLibrary",
      "viewTopCards",
      "viewGraveyard",
      "viewSideboard",
    ],
  },
  {
    title: "Board & turn",
    items: [
      "nextTurn",
      "passTurn",
      "untapAll",
      "buffCreatures",
      "clearManaPool",
      "createToken",
      "createAnotherToken",
      "removeMyArrows",
      "rollDie",
      "selectAll",
      "toggleGridSnap",
    ],
  },
  {
    title: "Life & chat",
    items: ["lifeInc", "lifeDec", "lifeSet", "focusChat"],
  },
  {
    title: "Hovered card",
    items: [
      "arrowFromHover",
      "tapHover",
      "attachHover",
      "flipHover",
      "graveyardHover",
      "bottomHover",
      "noteHover",
    ],
  },
];

/**
 * Normalize a key event to a combo string, or null for bare modifier
 * presses and keys nothing binds to. Pure — takes just the fields it reads
 * so tests can pass plain objects.
 */
export function eventToCombo(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): string | null {
  const ctrl = e.ctrlKey || e.metaKey;
  if (["Control", "Meta", "Alt", "Shift"].includes(e.key)) return null;

  let base: string;
  if (e.key === "Enter") base = "Enter";
  else if (e.key === "Delete") base = "Delete";
  else if (e.key === "-") base = "-";
  else if (e.key === "=" || e.key === "+") base = "=";
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.key)) base = e.key;
  else if (/^[a-z]$/i.test(e.key)) base = e.key.toUpperCase();
  else if (/^[0-9]$/.test(e.key)) base = e.key;
  else return null;

  const parts: string[] = [];
  if (ctrl) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(base);
  return parts.join("+");
}

/** Which (if any) bound action this key event triggers. Takes the same
 *  plain shape as eventToCombo, so a KeyboardEvent slots right in. */
export function matchKeybind(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): KeybindId | null {
  return COMBO_TO_ID.get(eventToCombo(e) ?? "") ?? null;
}

/** True when a key event originated somewhere the user is typing —
 *  shortcuts must stay inert there (chat, pile filter, pickers). */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable === true;
}
