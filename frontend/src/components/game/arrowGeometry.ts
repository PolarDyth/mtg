// Pure geometry for battlefield arrows: no DOM, no React — testable math.

export type Pt = { x: number; y: number };

const HEAD_LEN = 13;
const HEAD_HALF = 6.5;

const r = (n: number): number => Math.round(n * 100) / 100;

/**
 * A curved arrow from `from` toward `to`: a quadratic bezier with a
 * consistent clockwise bow (perpendicular offset clamped so short arrows
 * stay subtle and long ones never balloon), plus a filled arrowhead aligned
 * to the curve's end tangent and the curve's midpoint (t = 0.5) for
 * decorations. `shortenFrom`/`shortenTo` pull the endpoints back along the
 * direction vector so the arrow meets its targets' edges instead of driving
 * through their centers — and stays out of the way of card clicks.
 */
export function arrowPath(
  from: Pt,
  to: Pt,
  shortenFrom = 0,
  shortenTo = 0
): { d: string; head: string; mid: Pt } {
  const rawDx = to.x - from.x;
  const rawDy = to.y - from.y;
  const dist = Math.hypot(rawDx, rawDy) || 1;
  const ux = rawDx / dist;
  const uy = rawDy / dist;
  // never shorten past the midpoint of a very short arrow
  const back = Math.min(shortenFrom, dist / 2 - 1);
  const fwd = Math.min(shortenTo, dist / 2 - 1);
  const start = {
    x: from.x + ux * Math.max(0, back),
    y: from.y + uy * Math.max(0, back),
  };
  const end = {
    x: to.x - ux * Math.max(0, fwd),
    y: to.y - uy * Math.max(0, fwd),
  };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(48, Math.max(12, len * 0.15));
  // rotate the direction 90° clockwise (screen coords, y grows downward)
  const nx = -dy / len;
  const ny = dx / len;
  const cx = (start.x + end.x) / 2 + nx * bow;
  const cy = (start.y + end.y) / 2 + ny * bow;
  const d = `M ${r(start.x)} ${r(start.y)} Q ${r(cx)} ${r(cy)} ${r(end.x)} ${r(end.y)}`;
  // quadratic at t = 0.5: (P0 + 2·C + P2) / 4
  const mid = {
    x: r((start.x + 2 * cx + end.x) / 4),
    y: r((start.y + 2 * cy + end.y) / 4),
  };
  // end tangent of a quadratic at t = 1 is P2 − P1
  const angle = Math.atan2(end.y - cy, end.x - cx);
  const headTip = { x: end.x, y: end.y };
  const backPt = { x: end.x - Math.cos(angle) * HEAD_LEN, y: end.y - Math.sin(angle) * HEAD_LEN };
  const px = -Math.sin(angle) * HEAD_HALF;
  const py = Math.cos(angle) * HEAD_HALF;
  const head = `M ${r(headTip.x)} ${r(headTip.y)} L ${r(backPt.x + px)} ${r(backPt.y + py)} L ${r(backPt.x - px)} ${r(backPt.y - py)} Z`;
  return { d, head, mid };
}

/** Center of a rect expressed in the coordinate space of `root`. */
export function localCenter(rect: DOMRect, root: DOMRect): Pt {
  return {
    x: rect.left + rect.width / 2 - root.left,
    y: rect.top + rect.height / 2 - root.top,
  };
}
