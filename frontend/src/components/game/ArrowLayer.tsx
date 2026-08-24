"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Arrow, PlayerId, PlayerView } from "@cardessa/shared";
import { nameColor } from "@/lib/playerColor";
import { arrowPath, localCenter, type Pt } from "./arrowGeometry";

type Segment = {
  arrow: Arrow;
  d: string;
  head: string;
  mid: Pt;
  color: string;
};

/**
 * Committed arrows over the whole table. Mounted inside Battlefield's root
 * div, it spans every band in every view mode (including the maximize
 * overlay). Endpoints are resolved from live DOM rects — PlayerBand already
 * applies the point-mirroring, so rect centers are viewer-truth and no
 * coordinate math is duplicated here. Arrows whose endpoints aren't on
 * screen (e.g. the other pair in duel view) are skipped until visible.
 *
 * Hover is limited to the painted stroke (the arrowhead is click-through)
 * — an invisible fat hit corridor would eat card drags underneath, and the
 * tip meets the target's edge, not its center.
 */
export default function ArrowLayer({
  arrows,
  players,
  onRemove,
}: {
  arrows: Arrow[];
  players: PlayerView[];
  onRemove: (id: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const signature = useRef("");

  const resolve = useCallback(() => {
    const svg = svgRef.current;
    const scope = svg?.parentElement;
    if (!svg || !scope) return;
    const root = svg.getBoundingClientRect();
    const next: Segment[] = [];
    for (const arrow of arrows) {
      const fromEl = scope.querySelector(
        `[data-card-uid="${CSS.escape(arrow.fromUid)}"]`
      );
      const toEl =
        "uid" in arrow.to
          ? scope.querySelector(`[data-card-uid="${CSS.escape(arrow.to.uid)}"]`)
          : scope.querySelector(
              `[data-player-head="${CSS.escape(arrow.to.playerId)}"]`
            );
      if (!fromEl || !toEl) continue;
      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();
      // meet the endpoints' edges, not their centers: the tip must not sit
      // where players click and drag cards
      const { d, head, mid } = arrowPath(
        localCenter(fromRect, root),
        localCenter(toRect, root),
        Math.min(fromRect.width, fromRect.height) / 2 + 6,
        Math.min(toRect.width, toRect.height) / 2 + 14
      );
      next.push({ arrow, d, head, mid, color: nameColor(arrow.playerId) });
    }
    // setState only when geometry actually changed, else the layout effect
    // would re-render forever
    const sig = next.map((s) => `${s.arrow.id}:${s.d}:${s.head}`).join("|");
    if (sig !== signature.current) {
      signature.current = sig;
      setSegments(next);
    }
  }, [arrows]);

  // re-resolve after every render: arrows/players get fresh identities on
  // each snapshot and cards may have moved under the same arrows
  useLayoutEffect(resolve);
  // relayout (resize, band re-gridding) moves every endpoint at once
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(() => resolve());
    observer.observe(svg);
    return () => observer.disconnect();
  }, [resolve]);

  const nameOf = (id: PlayerId) =>
    players.find((p) => p.id === id)?.name ?? "someone";

  return (
    <svg
      ref={svgRef}
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
    >
      {segments.map((seg) => {
        const active = hovered === seg.arrow.id;
        return (
          <g
            key={seg.arrow.id}
            className="pointer-events-auto"
            opacity={active ? 1 : 0.85}
            onPointerEnter={() => setHovered(seg.arrow.id)}
            onPointerLeave={() =>
              setHovered((h) => (h === seg.arrow.id ? null : h))
            }
          >
            <title>{`${nameOf(seg.arrow.playerId)}'s arrow — hover and click ✕ to remove`}</title>
            <path
              d={seg.d}
              fill="none"
              stroke={seg.color}
              strokeWidth={4}
              strokeLinecap="round"
              pathLength={1}
              className="arrow-line"
              style={{ filter: `drop-shadow(0 1px 6px ${seg.color})` }}
            />
            {/* the head sits next to a card; it must never eat its clicks */}
            <path
              d={seg.head}
              fill={seg.color}
              className="arrow-head"
              style={{ pointerEvents: "none" }}
            />
            {active && (
              <g
                className="cursor-pointer"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onRemove(seg.arrow.id);
                }}
              >
                <circle
                  cx={seg.mid.x}
                  cy={seg.mid.y}
                  r={11}
                  fill="#18181b"
                  stroke={seg.color}
                  strokeWidth={1.5}
                />
                <path
                  d={`M ${seg.mid.x - 4} ${seg.mid.y - 4} L ${seg.mid.x + 4} ${seg.mid.y + 4} M ${seg.mid.x + 4} ${seg.mid.y - 4} L ${seg.mid.x - 4} ${seg.mid.y + 4}`}
                  stroke="#a1a1aa"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The live rubber band while drawing or picking a target: source card →
 * cursor, in viewport coordinates (the cursor is viewport-space, so is the
 * draft; the committed arrow re-renders in ArrowLayer after the snapshot).
 */
export function ArrowDraft({
  fromUid,
  x,
  y,
  color,
}: {
  fromUid: string;
  x: number;
  y: number;
  color: string;
}) {
  const [from, setFrom] = useState<Pt | null>(null);

  // measure the source card after layout on every render (the cursor moves
  // each pointermove anyway, so there is nothing to win from deps)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = document.querySelector(
      `[data-card-uid="${CSS.escape(fromUid)}"]`
    );
    const rect = el?.getBoundingClientRect();
    const center = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : null;
    // DOM measurement must follow layout; the near-equality guard keeps it
    // from cascading renders
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFrom((prev) =>
      prev && center && Math.abs(prev.x - center.x) < 0.5 && Math.abs(prev.y - center.y) < 0.5
        ? prev
        : center
    );
  });

  if (!from) return null;
  const { d, head } = arrowPath(from, { x, y });
  return (
    <svg className="pointer-events-none fixed inset-0 z-40">
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.9}
      />
      <path d={head} fill={color} opacity={0.9} />
    </svg>
  );
}
