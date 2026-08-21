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
  // stick to the bottom on new messages unless the reader scrolled up;
  // state (not a ref) so the "new messages" pill can react to it
  const [atBottom, setAtBottom] = useState(true);
  // id of the last message that was in view at the bottom — counts what the
  // reader missed while scrolled up
  const [lastSeenId, setLastSeenId] = useState<string | null>(null);
  // hovered card mention — rendered as a preview left of the chat rail
  const [mention, setMention] = useState<{ def: CardDef; top: number } | null>(null);

  const lastId = messages.length > 0 ? messages[messages.length - 1].id : "";

  useEffect(() => {
    const el = listRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
    // keyed on the last message id, not the length: once the log hits
    // CHAT_CAP it stops growing and evicts from the front, so the length
    // never changes again and a length-keyed effect silently stops firing
  }, [lastId, atBottom]);

  const seenIndex = lastSeenId === null ? -2 : messages.findIndex((m) => m.id === lastSeenId);
  const missed = atBottom
    ? 0
    : seenIndex === -2
      ? 0
      : messages.length - 1 - (seenIndex === -1 ? -1 : seenIndex);

  function jumpToLatest() {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setAtBottom(true);
    if (lastId) setLastSeenId(lastId);
  }

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
            const near = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            setAtBottom(near);
            if (near && lastId) setLastSeenId(lastId);
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
        {missed > 0 && (
          <li className="sticky bottom-0 z-10 flex justify-center">
            <button
              onClick={jumpToLatest}
              className="rounded-full border border-zinc-700 bg-zinc-800/95 px-3 py-1 text-xs font-medium text-emerald-200 shadow-lg hover:border-emerald-600"
            >
              ↓ {missed} new message{missed === 1 ? "" : "s"}
            </button>
          </li>
        )}
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
