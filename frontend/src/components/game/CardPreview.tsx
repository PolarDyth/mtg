"use client";

import type { CSSProperties } from "react";
import type { CardDef } from "@/lib/scryfall";

/**
 * The floating card preview bubble. One component so every surface (table
 * hover, pile viewer, chat mentions, reveal popup) renders and sizes
 * identically from the user's saved preview width. Always shows the
 * Scryfall "normal" art.
 */
export default function CardPreview({
  def,
  width,
  className = "",
  style,
}: {
  def: CardDef;
  width: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`pointer-events-none rounded-lg bg-black/70 p-1 shadow-2xl ${className}`}
    >
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
