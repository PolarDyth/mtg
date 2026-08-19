"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientMessage, ServerMessage } from "@mythic/shared";
import { loadName, saveName, saveSession } from "@/lib/session";

type Welcome = Extract<ServerMessage, { type: "welcome" }>;

/** One-shot hello over a fresh socket; used by create/join on the home page. */
function hello(message: ClientMessage): Promise<Welcome> {
  return new Promise((resolve, reject) => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    const fail = (reason: string) => {
      try {
        ws.close();
      } catch {
        // already closing
      }
      reject(new Error(reason));
    };
    ws.onopen = () => ws.send(JSON.stringify(message));
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        if (msg.type === "welcome") {
          ws.close();
          resolve(msg);
        } else if (msg.type === "error") {
          fail(msg.message);
        }
      } catch {
        fail("protocol error");
      }
    };
    ws.onerror = () => fail("could not reach the server");
    setTimeout(() => fail("timed out talking to the server"), 8000);
  });
}

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(loadName() ?? "");
  }, []);

  async function createTable() {
    if (!validName()) return;
    await attempt({ kind: "create", name: name.trim() });
  }

  async function joinTable() {
    if (!validName()) return;
    const cleaned = code.trim().toUpperCase();
    if (!/^[A-Z]+-\d{4}$/.test(cleaned)) {
      setError("Room codes look like PLAINS-42");
      return;
    }
    await attempt({ kind: "join", code: cleaned, name: name.trim() });
  }

  function validName(): boolean {
    const cleaned = name.trim();
    if (cleaned.length < 1) {
      setError("Pick a display name first");
      return false;
    }
    saveName(cleaned);
    return true;
  }

  async function attempt(message: ClientMessage) {
    setBusy(true);
    setError(null);
    try {
      const welcome = await hello(message);
      saveSession(welcome.code, {
        token: welcome.token,
        playerId: welcome.you,
        name: name.trim(),
      });
      router.push(`/game/${encodeURIComponent(welcome.code)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-serif font-bold tracking-tight text-zinc-100">
            Mythic Table
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            A no-rules-enforced virtual tabletop for Magic: The Gathering
          </p>
        </header>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-6 shadow-xl backdrop-blur">
          <label className="block text-sm font-medium text-zinc-300">
            Your name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jace"
              maxLength={24}
              className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-600"
            />
          </label>

          <button
            onClick={createTable}
            disabled={busy}
            className="mt-4 w-full rounded-md bg-emerald-700 px-4 py-2.5 font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            Create a table
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-zinc-600">
            <span className="h-px flex-1 bg-zinc-800" />
            or join a friend
            <span className="h-px flex-1 bg-zinc-800" />
          </div>

          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && joinTable()}
              placeholder="PLAINS-42"
              className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm uppercase tracking-wide text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-600"
            />
            <button
              onClick={joinTable}
              disabled={busy}
              className="rounded-md bg-zinc-800 px-4 py-2 font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
            >
              Join
            </button>
          </div>

          {error && (
            <p className="mt-4 rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          No accounts, no rules enforcement — just a shared table.
          Bring your own decklist.
        </p>
      </div>
    </main>
  );
}
