"use client";

import type { ChatMessage, PlayerId, PlayerView } from "@cardessa/shared";
import type { CardDef } from "@/lib/scryfall";
import { Eye } from "lucide-react";

export type RevealChatMessage = Extract<ChatMessage, { kind: "reveal" }>;

/**
 * Popup shown when a fresh reveal lands in chat: big card art for everyone
 * the reveal was for. Dismissed by clicking anywhere or pressing Escape.
 */
export default function RevealPopup({
  message,
  revealerName,
  you,
  players,
  getDef,
  previewWidth,
  onClose,
}: {
  message: RevealChatMessage;
  revealerName: string;
  you: PlayerId | null;
  players: PlayerView[];
  getDef: (id: string | null) => CardDef | null;
  previewWidth: number;
  onClose: () => void;
}) {
  const isYou = message.playerId === you;
  const isTargeted = message.to !== undefined;
  const isTarget = you !== null && message.to?.includes(you) === true;
  const targetNames = (message.to ?? [])
    .map((id) => players.find((p) => p.id === id)?.name ?? "someone")
    .join(", ");

  const title = isYou
    ? isTargeted
      ? `You revealed to ${targetNames}`
      : "You revealed"
    : isTarget
      ? `${revealerName} revealed to you`
      : `${revealerName} revealed`;
  const count = message.cards.length;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      {/* keyed by message so a queued follow-up reveal replays the entrance */}
      <div
        key={message.id}
        className="overlay-in flex max-h-[85vh] w-full max-w-5xl flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-zinc-800 px-5 py-3">
          <Eye className="h-4 w-4 shrink-0 text-emerald-500/80" strokeWidth={1.75} />
          <h2 className="font-semibold text-zinc-100">
            {title}{" "}
            <span className="font-normal text-zinc-400">
              {count} {count === 1 ? "card" : "cards"}
            </span>
          </h2>
          <button
            onClick={onClose}
            className="ml-auto rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close reveal"
          >
            ✕
          </button>
        </header>

        <div className="flex flex-1 flex-wrap content-start items-start gap-2 overflow-y-auto p-4">
          {message.cards.map((card, i) => {
            const def = getDef(card.cardId);
            const key = `${card.cardId}:${i}`;
            return def ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={key}
                src={def.normal}
                alt={def.name}
                style={{ width: previewWidth }}
                className="rounded-md shadow-lg"
                draggable={false}
              />
            ) : (
              // def still fetching — name-labeled placeholder, PileModal style
              <div
                key={key}
                style={{ width: previewWidth }}
                className="flex aspect-[146/204] items-center justify-center rounded-md border border-zinc-700 bg-gradient-to-br from-zinc-800 to-zinc-950 p-2 text-center text-xs text-zinc-400"
              >
                {card.name}
              </div>
            );
          })}
        </div>

        <footer className="border-t border-zinc-800 px-5 py-2.5 text-xs text-zinc-600">
          click anywhere to close · hover the card names in chat to see them again
        </footer>
      </div>
    </div>
  );
}
