"use client";

import {
  DEFAULT_KEYBINDS,
  KEYBIND_LABELS,
  SHORTCUT_GROUPS,
} from "@/lib/keybinds";

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] leading-none text-zinc-200">
      {children}
    </kbd>
  );
}

/** One row: action on the left, key chips on the right. */
function Row({ label, keys }: { label: string; keys: string[] }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1">
      <span className="min-w-0 text-sm text-zinc-300">{label}</span>
      <span className="flex shrink-0 items-center gap-1">
        {keys.map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </span>
    </li>
  );
}

/** Pointer gestures — not in DEFAULT_KEYBINDS, listed by hand. */
const MOUSE_ROWS: { label: string; keys: string[] }[] = [
  { label: "Move a card between zones", keys: ["Drag"] },
  { label: "Attach to another card", keys: ["Drag", "onto card"] },
  { label: "Tap / untap a permanent", keys: ["Click"] },
  { label: "Card actions menu", keys: ["Right-click"] },
  { label: "Start an arrow from a card", keys: ["Ctrl", "Right-click"] },
  { label: "Place the arrow (Esc cancels)", keys: ["Click", "target"] },
  { label: "Resize a card preview", keys: ["Ctrl", "Scroll"] },
];

/** Cheat sheet of every shortcut — the "?" key or the header button opens it. */
export default function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <h2 className="font-semibold text-zinc-100">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            aria-label="Close shortcuts"
            className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            ✕
          </button>
        </header>

        <div className="overflow-y-auto p-5">
          <p className="text-xs leading-relaxed text-zinc-500">
            Cockatrice&apos;s defaults, remapped where browsers reserve the keys
            (Ctrl+Alt+T token, Ctrl+Alt+W top cards, Ctrl+Alt+=/− life). Card
            shortcuts act on the card under the cursor. Press <Kbd>?</Kbd> anytime
            to reopen this sheet.
          </p>

          <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {SHORTCUT_GROUPS.map((group) => (
              <section key={group.title}>
                <h3 className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                  {group.title}
                </h3>
                <ul className="mt-1.5">
                  {group.items.map((id) => (
                    <Row
                      key={id}
                      label={KEYBIND_LABELS[id]}
                      keys={DEFAULT_KEYBINDS[id].split("+")}
                    />
                  ))}
                </ul>
              </section>
            ))}

            <section className="sm:col-span-2">
              <h3 className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                Mouse
              </h3>
              <ul className="mt-1.5 grid gap-x-8 sm:grid-cols-2">
                {MOUSE_ROWS.map((row) => (
                  <Row key={row.label} label={row.label} keys={row.keys} />
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
