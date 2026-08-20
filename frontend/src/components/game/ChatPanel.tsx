"use client";

import type { Action, DieSides, GameView, PlayerId, PlayerView } from "@mythic/shared";
import type { CardDef } from "@/lib/scryfall";
import { Crown } from "lucide-react";
import { useState } from "react";
import { ChatInput, ChatLog, nameColor } from "./ChatLog";

const DICE: DieSides[] = [4, 6, 8, 10, 12, 20, 100];

/** Right rail: players + life, dice, next turn, chat. */
export default function ChatPanel({
  view,
  you,
  send,
  getDef,
  previewWidth,
  chatFocusTick,
  lifeFocusTick,
}: {
  view: GameView;
  you: PlayerId | null;
  send: (action: Action) => void;
  getDef: (id: string | null) => CardDef | null;
  previewWidth: number;
  /** increments when a shortcut (Shift+Enter) asks the chat input to focus */
  chatFocusTick: number;
  /** increments when a shortcut (Ctrl+L) asks the life editor to open */
  lifeFocusTick: number;
}) {
  return (
    <aside className="flex w-[280px] shrink-0 flex-col gap-3">
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
        <ul className="space-y-1.5">
          {view.players.map((player) => (
            <PlayerRow
              key={player.id}
              player={player}
              active={player.id === view.activePlayerId}
              isHost={player.id === view.hostId}
              isSelf={player.id === you}
              send={send}
              focusTick={player.id === you ? lifeFocusTick : 0}
            />
          ))}
        </ul>
      </section>

      <section className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
        {DICE.map((sides) => (
          <button
            key={sides}
            onClick={() => send({ type: "ROLL_DIE", sides })}
            title={`Roll a d${sides}`}
            className="rounded bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-300 hover:bg-zinc-700"
          >
            d{sides}
          </button>
        ))}
        <button
          onClick={() => send({ type: "NEXT_TURN" })}
          className="ml-auto rounded bg-emerald-800 px-3 py-1 text-xs font-medium text-emerald-100 hover:bg-emerald-700"
        >
          Next turn ⏭
        </button>
      </section>

      <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
        <ChatLog
          messages={view.chat}
          players={view.players}
          you={you}
          getDef={getDef}
          previewWidth={previewWidth}
          className="flex-1 overflow-y-auto pr-1"
        />
        <div className="mt-3">
          <ChatInput
            onSend={(text) => send({ type: "SEND_CHAT", text })}
            focusTick={chatFocusTick}
          />
        </div>
      </section>
    </aside>
  );
}

function PlayerRow({
  player,
  active,
  isHost,
  isSelf,
  send,
  focusTick,
}: {
  player: PlayerView;
  active: boolean;
  isHost: boolean;
  isSelf: boolean;
  send: (action: Action) => void;
  /** increments when a shortcut asks this editor to open (self only) */
  focusTick: number;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(player.life));
  // shortcut-driven editor focus: render-time reset (no setState in effects);
  // the input's autoFocus does the actual focusing once it mounts
  const [seenTick, setSeenTick] = useState(focusTick);
  if (focusTick !== seenTick) {
    setSeenTick(focusTick);
    setValue(String(player.life));
    setEditing(true);
  }

  function commit() {
    const parsed = parseInt(value, 10);
    if (Number.isInteger(parsed)) send({ type: "SET_LIFE", life: parsed });
    setEditing(false);
  }

  return (
    <li
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
        active ? "bg-emerald-950/40 ring-1 ring-emerald-800/60" : ""
      }`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          player.connected ? "bg-emerald-500" : "bg-zinc-600"
        }`}
        title={player.connected ? "connected" : "disconnected"}
      />
      <span className="truncate text-sm font-medium" style={{ color: nameColor(player.id) }}>
        {player.name}
        {isSelf && <span className="ml-1 text-[10px] text-zinc-500">(you)</span>}
      </span>
      {isHost && (
        <span title="host" className="shrink-0">
          <Crown className="h-3.5 w-3.5 text-amber-300/80" strokeWidth={1.75} />
        </span>
      )}
      {isSelf ? (
        <span className="ml-auto flex items-center gap-1">
          {[-5, -1].map((delta) => (
            <button
              key={delta}
              onClick={() => send({ type: "SET_LIFE", life: player.life + delta })}
              className="rounded bg-zinc-800 px-1.5 text-xs text-red-300 hover:bg-zinc-700"
            >
              {delta}
            </button>
          ))}
          {editing ? (
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === "Enter" && commit()}
              className="w-10 rounded bg-zinc-950 px-1 text-right font-mono text-sm text-red-300 outline-none ring-1 ring-emerald-600"
            />
          ) : (
            <button
              onClick={() => {
                setValue(String(player.life));
                setEditing(true);
              }}
              title="set life"
              className="w-9 rounded bg-zinc-800 py-0.5 font-mono text-sm text-red-300 hover:bg-zinc-700"
            >
              {player.life}
            </button>
          )}
          {[1, 5].map((delta) => (
            <button
              key={delta}
              onClick={() => send({ type: "SET_LIFE", life: player.life + delta })}
              className="rounded bg-zinc-800 px-1.5 text-xs text-emerald-300 hover:bg-zinc-700"
            >
              +{delta}
            </button>
          ))}
        </span>
      ) : (
        <span className="ml-auto font-mono text-sm text-red-300">{player.life}</span>
      )}
    </li>
  );
}
