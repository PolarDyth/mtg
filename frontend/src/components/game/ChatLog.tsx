"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage, PlayerId, PlayerView } from "@mythic/shared";
import type { CardDef } from "@/lib/scryfall";
import { PREVIEW_DEFAULT } from "@/lib/settings";
import CardPreview from "./CardPreview";
import { CARD_RATIO } from "./CardSprite";
import { nameColor } from "@/lib/playerColor";

// re-exported for the components that historically imported it from here
export { nameColor };

export function ChatLog({
  messages,
  players,
  you = null,
  getDef = () => null,
  previewWidth = PREVIEW_DEFAULT,
  className = "",
}: {
  messages: ChatMessage[];
  players: PlayerView[];
  you?: PlayerId | null;
  getDef?: (id: string | null) => CardDef | null;
  previewWidth?: number;
  className?: string;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  // stick to the bottom on new messages unless the reader scrolled up
  const stick = useRef(true);
  // hovered card mention — rendered as a preview left of the chat rail
  const [mention, setMention] = useState<{ def: CardDef; top: number } | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const nameOf = (id: string) =>
    players.find((p) => p.id === id)?.name ?? "someone";

  // "revealed" / "revealed to you" / (for the revealer) "revealed to Bob"
  function revealTail(m: Extract<ChatMessage, { kind: "reveal" }>): string {
    if (!m.to) return "revealed";
    if (you !== null && m.to.includes(you)) return "revealed to you";
    if (m.playerId === you) {
      const names = m.to
        .map((id) => players.find((p) => p.id === id)?.name ?? "someone")
        .join(", ");
      return `revealed to ${names}`;
    }
    return "revealed"; // server filters outsiders, but never crash on a race
  }

  return (
    <>
      <ul
        ref={listRef}
        onScroll={() => {
          const el = listRef.current;
          if (el) {
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }
        }}
        className={`space-y-1 text-sm leading-snug ${className}`}
      >
        {messages.map((m) => {
          switch (m.kind) {
            case "system":
              return (
                <li key={m.id} className="text-zinc-500 italic">
                  {m.text}
                </li>
              );
            case "dice":
              return (
                <li key={m.id}>
                  <span className="text-zinc-400">🎲 {nameOf(m.playerId)} rolled a d{m.sides}:</span>{" "}
                  <span className="font-semibold text-amber-300">{m.result}</span>
                </li>
              );
            case "reveal":
              return (
                <li key={m.id}>
                  <span style={{ color: nameColor(m.playerId) }}>
                    {m.playerId === you ? "You" : nameOf(m.playerId)}
                  </span>{" "}
                  <span className="text-zinc-400">{revealTail(m)}:</span>{" "}
                  {m.cards.map((card, i) => (
                    <span key={`${card.cardId}:${i}`} className="text-emerald-300">
                      {i > 0 && ", "}
                      <span
                        className="cursor-help underline decoration-dotted underline-offset-2 hover:text-emerald-200"
                        onMouseEnter={(e) => {
                          const def = getDef(card.cardId);
                          if (def) {
                            setMention({ def, top: e.currentTarget.getBoundingClientRect().top });
                          }
                        }}
                        onMouseLeave={() => setMention(null)}
                      >
                        {card.name}
                      </span>
                    </span>
                  ))}
                </li>
              );
            case "text":
              return (
                <li key={m.id}>
                  <span className="font-medium" style={{ color: nameColor(m.playerId) }}>
                    {nameOf(m.playerId)}
                  </span>
                  <span className="text-zinc-500">: </span>
                  <span>{m.text}</span>
                </li>
              );
          }
        })}
      </ul>
      {mention && (
        <CardPreview
          def={mention.def}
          width={previewWidth}
          className="fixed z-50"
          style={{
            // left of the 280px chat rail (+ gap and page padding)
            right: 296,
            top: Math.max(
              8,
              Math.min(mention.top, window.innerHeight - previewWidth * CARD_RATIO - 16)
            ),
          }}
        />
      )}
    </>
  );
}

export function ChatInput({
  onSend,
  placeholder = "Message the table…",
  focusTick = 0,
}: {
  onSend: (text: string) => void;
  placeholder?: string;
  /** increments when a shortcut (Shift+Enter) asks the input to focus */
  focusTick?: number;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (focusTick > 0) inputRef.current?.focus();
  }, [focusTick]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed) onSend(trimmed);
    setText("");
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        maxLength={500}
        className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm outline-none placeholder:text-zinc-600 focus:border-emerald-600"
      />
      <button
        type="submit"
        className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:bg-zinc-700"
      >
        Send
      </button>
    </form>
  );
}
