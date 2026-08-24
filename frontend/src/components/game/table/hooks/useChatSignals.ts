"use client";

/**
 * Shortcut-driven focus requests for the chat panel (incrementing ticks the
 * ChatPanel consumes), plus the life +/-/set keybinds — they read the life
 * total straight off the snapshot.
 */

import { useState } from "react";
import type { Action, PlayerView } from "@cardessa/shared";
import type { KeybindSlice } from "../keybinds";

export function useChatSignals({
  self,
  send,
}: {
  self: PlayerView | null;
  send: (action: Action) => void;
}) {
  const [chatFocusTick, setChatFocusTick] = useState(0);
  const [lifeFocusTick, setLifeFocusTick] = useState(0);

  const keybinds = {
    lifeSet: () => setLifeFocusTick((t) => t + 1),
    lifeInc: () => {
      if (self) send({ type: "SET_LIFE", life: self.life + 1 });
    },
    lifeDec: () => {
      if (self) send({ type: "SET_LIFE", life: self.life - 1 });
    },
    focusChat: () => setChatFocusTick((t) => t + 1),
  } satisfies KeybindSlice;

  return { chatFocusTick, lifeFocusTick, keybinds };
}
