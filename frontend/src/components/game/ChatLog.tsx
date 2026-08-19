"use client";

import { useState, type FormEvent } from "react";
import type { ChatMessage, PlayerView } from "@mythic/shared";

/** Stable per-player hue for names in chat. */
export function nameColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 70% 72%)`;
}

export function ChatLog({
  messages,
  players,
  className = "",
}: {
  messages: ChatMessage[];
  players: PlayerView[];
  className?: string;
}) {
  const nameOf = (id: string) =>
    players.find((p) => p.id === id)?.name ?? "someone";

  return (
    <ul className={`space-y-1 text-sm leading-snug ${className}`}>
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
                <span style={{ color: nameColor(m.playerId) }}>{nameOf(m.playerId)}</span>{" "}
                <span className="text-zinc-400">revealed:</span>{" "}
                <span className="text-emerald-300">
                  {m.cards.map((c) => c.name).join(", ")}
                </span>
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
  );
}

export function ChatInput({
  onSend,
  placeholder = "Message the table…",
}: {
  onSend: (text: string) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed) onSend(trimmed);
    setText("");
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
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
