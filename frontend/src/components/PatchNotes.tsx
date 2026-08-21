"use client";

import { useState } from "react";
import { ChevronDown, ScrollText } from "lucide-react";
import { PATCH_NOTES } from "@/lib/patchNotes";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Deterministic "Aug 21, 2026" — avoids locale differences between SSR and client. */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

export default function PatchNotes() {
  const [open, setOpen] = useState(false);
  const [latest] = PATCH_NOTES;

  return (
    <section className="mt-6 flex min-h-0 flex-col rounded-xl border border-zinc-800 bg-zinc-900/70 shadow-xl backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full shrink-0 items-center gap-2.5 px-5 py-4 text-left"
      >
        <ScrollText
          className="h-4 w-4 shrink-0 text-emerald-400"
          strokeWidth={1.75}
        />
        <span className="flex-1 text-sm font-medium text-zinc-100">
          Patch notes
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform${
            open ? " rotate-180" : ""
          }`}
          strokeWidth={1.75}
        />
      </button>

      {!open && (
        <p className="px-5 pb-4 text-xs text-zinc-500">
          Latest: {latest.label} — {latest.items.length} changes ·{" "}
          {formatDate(latest.date)}
        </p>
      )}

      {open && (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto border-t border-zinc-800 px-5 py-4">
          {PATCH_NOTES.map((release, index) => (
            <div key={release.id}>
              <div className="flex items-baseline gap-2">
                {index === 0 && (
                  <span
                    className="h-1.5 w-1.5 self-center rounded-full bg-emerald-500"
                    aria-hidden
                  />
                )}
                <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {release.label}
                </h2>
                <span className="text-xs text-zinc-600">
                  {formatDate(release.date)}
                </span>
              </div>
              <ul className="mt-2 space-y-2">
                {release.items.map((item) => (
                  <li key={item.title} className="text-sm">
                    <p className="font-medium text-zinc-200">{item.title}</p>
                    {item.detail && (
                      <p className="mt-0.5 text-zinc-400">{item.detail}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
