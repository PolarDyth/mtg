"use client";

/**
 * Keyboard-shortcut registry for the game table — the frontend twin of the
 * server's engine/actions registry. Feature hooks each return a Partial
 * slice covering only their own KeybindIds; GameTable composes the slices
 * into one annotated Record<KeybindId, KeybindHandler>, so a KeybindId
 * added to lib/keybinds.ts without a handler anywhere fails tsc. Keep one
 * owner per id (a spread collision silently last-wins).
 */

import { useEffect, useState } from "react";
import { isTypingTarget, matchKeybind, type KeybindId } from "@/lib/keybinds";

export type KeybindHandler = () => void;
export type KeybindSlice = Partial<Record<KeybindId, KeybindHandler>>;

/** The table's keybind listener. Owns the shortcuts cheat sheet ("?"
 *  toggles it); inert while typing and on key repeats; every match claims
 *  the browser default too (no bookmark/save/find/refresh mid-game). A game
 *  bind pressed while the sheet is open closes the sheet and still fires. */
export function useTableKeybinds(
  handlers: Record<KeybindId, KeybindHandler>
): {
  shortcutsOpen: boolean;
  openShortcuts: () => void;
  closeShortcuts: () => void;
} {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.repeat || isTypingTarget(event.target)) return;
      if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
      const id = matchKeybind(event);
      if (shortcutsOpen) {
        // reading the sheet and pressed a game bind: close the sheet and
        // run it — silently swallowing the key made working binds look
        // broken to anyone trying them straight off the cheat sheet
        if (id) {
          event.preventDefault();
          setShortcutsOpen(false);
          handlers[id]();
        }
        return;
      }
      if (!id) return;
      event.preventDefault();
      handlers[id]();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers, shortcutsOpen]);

  return {
    shortcutsOpen,
    openShortcuts: () => setShortcutsOpen(true),
    closeShortcuts: () => setShortcutsOpen(false),
  };
}
