"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { GripHorizontal } from "lucide-react";
import type { CardDef } from "@/lib/scryfall";

/** Vertical room the optional grab strip adds to the panel (strip + margin
 *  + bottom padding) — the position clamp sizes the panel with this. */
export const PREVIEW_GRIP_BLOCK = 26;

/**
 * The floating card preview bubble. One component so every surface (table
 * hover, pile viewer, chat mentions, reveal popup) renders and sizes
 * identically from the user's saved preview width. Always shows the
 * Scryfall "normal" art. The wrapper is pointer-events-none so an idle
 * panel never swallows card hovers; passing `dragHandle` adds the one
 * interactive element — a grab strip above the art.
 */
export default function CardPreview({
  def,
  width,
  className = "",
  style,
  dragHandle,
}: {
  def: CardDef;
  width: number;
  className?: string;
  style?: CSSProperties;
  dragHandle?: { onPointerDown: (event: ReactPointerEvent) => void };
}) {
  return (
    <div
      data-preview-panel
      style={style}
      className={`pointer-events-none rounded-lg bg-black/70 p-1 shadow-2xl ${className}`}
    >
      {dragHandle && (
        <div
          onPointerDown={dragHandle.onPointerDown}
          title="Drag to move the preview"
          className="pointer-events-auto -mx-1 -mt-1 mb-0.5 flex h-5 touch-none select-none cursor-grab items-center justify-center rounded-t-lg bg-zinc-900/90 text-zinc-500 hover:text-zinc-300 active:cursor-grabbing"
        >
          <GripHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={def.normal}
        alt={def.name}
        style={{ width }}
        className="rounded"
        draggable={false}
      />
    </div>
  );
}
