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
  | "nextTurn"
  | "untapAll"
  | "shuffleLibrary"
  | "rollDie"
  | "millOne"
  | "millMany"
  | "playTopCard"
  | "viewLibrary"
  | "viewGraveyard"
  | "viewSideboard"
  | "viewTopCards"
  | "createToken"
  | "createAnotherToken"
  | "removeMyArrows"
  | "lifeSet"
  | "lifeInc"
  | "lifeDec"
  | "focusChat"
  | "selectAll"
  | "arrowFromHover"
  | "flipHover"
  | "graveyardHover"
  | "bottomHover"
  | "noteHover";

export const DEFAULT_KEYBINDS: Record<KeybindId, string> = {
  drawOne: "Ctrl+D",
  drawMany: "Ctrl+E",
  nextTurn: "Ctrl+Enter",
  untapAll: "Ctrl+U",
  shuffleLibrary: "Ctrl+S",
  rollDie: "Ctrl+I",
  millOne: "Alt+Y",
  millMany: "Alt+M",
  playTopCard: "Ctrl+Y",
  viewLibrary: "F3",
  viewGraveyard: "F4",
  viewSideboard: "Ctrl+F3",
  viewTopCards: "Ctrl+Alt+W",
  createToken: "Ctrl+Alt+T",
  createAnotherToken: "Ctrl+G",
  removeMyArrows: "Ctrl+R",
  lifeSet: "Ctrl+L",
  lifeInc: "Ctrl+Alt+=",
  lifeDec: "Ctrl+Alt+-",
  focusChat: "Shift+Enter",
  selectAll: "Ctrl+A",
  arrowFromHover: "Alt+A",
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
