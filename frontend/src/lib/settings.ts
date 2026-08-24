"use client";

// Per-user UI preferences, persisted in localStorage under the mtg: namespace
// (same conventions as cardCache/session: storage failures never throw).

const PREVIEW_KEY = "mtg:preview-width";

export const PREVIEW_MIN = 140;
/** Scryfall "normal" art is 488px wide — anything larger only upscales. */
export const PREVIEW_MAX = 448;
/** The size the hover preview originally shipped with (w-56). */
export const PREVIEW_DEFAULT = 224;

export function clampPreviewWidth(raw: number): number {
  if (!Number.isFinite(raw)) return PREVIEW_DEFAULT;
  return Math.min(PREVIEW_MAX, Math.max(PREVIEW_MIN, Math.round(raw)));
}

export function loadPreviewWidth(): number {
  try {
    return clampPreviewWidth(
      Number.parseInt(localStorage.getItem(PREVIEW_KEY) ?? "", 10)
    );
  } catch {
    return PREVIEW_DEFAULT;
  }
}

export function savePreviewWidth(width: number): void {
  try {
    localStorage.setItem(PREVIEW_KEY, String(clampPreviewWidth(width)));
  } catch {
    // private mode / quota — the choice just won't persist
  }
}

const PREVIEW_X_KEY = "mtg:preview-x";
const PREVIEW_Y_KEY = "mtg:preview-y";

/** Viewport margin a dragged preview keeps on every side. */
const PREVIEW_POS_MARGIN = 8;

/** Where the hover preview sits once the player has dragged it (top-left,
 *  viewport px). null = the default bottom-left anchor, never touched. */
export type PreviewPos = { x: number; y: number };

/** Clamp a top-left panel position into the viewport — pure, with the
 *  viewport and panel sizes as plain numbers so tests need no DOM. */
export function clampPreviewPos(
  x: number,
  y: number,
  viewportW: number,
  viewportH: number,
  panelW: number,
  panelH: number
): PreviewPos {
  // Viewport narrower/shorter than the panel: pin to the margin rather
  // than inverting the clamp range.
  const maxX = Math.max(PREVIEW_POS_MARGIN, viewportW - panelW - PREVIEW_POS_MARGIN);
  const maxY = Math.max(PREVIEW_POS_MARGIN, viewportH - panelH - PREVIEW_POS_MARGIN);
  const fix = (v: number) => (Number.isFinite(v) ? Math.round(v) : PREVIEW_POS_MARGIN);
  return {
    x: Math.min(maxX, Math.max(PREVIEW_POS_MARGIN, fix(x))),
    y: Math.min(maxY, Math.max(PREVIEW_POS_MARGIN, fix(y))),
  };
}

export function loadPreviewPos(): PreviewPos | null {
  try {
    const x = Number.parseInt(localStorage.getItem(PREVIEW_X_KEY) ?? "", 10);
    const y = Number.parseInt(localStorage.getItem(PREVIEW_Y_KEY) ?? "", 10);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch {
    return null;
  }
}

export function savePreviewPos(pos: PreviewPos): void {
  try {
    localStorage.setItem(PREVIEW_X_KEY, String(pos.x));
    localStorage.setItem(PREVIEW_Y_KEY, String(pos.y));
  } catch {
    // same tolerance as the other preferences
  }
}

/** Forget a dragged position — the preview returns to the default anchor. */
export function clearPreviewPos(): void {
  try {
    localStorage.removeItem(PREVIEW_X_KEY);
    localStorage.removeItem(PREVIEW_Y_KEY);
  } catch {
    // same tolerance as the other preferences
  }
}

const GRID_SNAP_KEY = "mtg:grid-snap";

/** Drops land on a 5% lattice of your board when snapping is on. */
export function loadGridSnap(): boolean {
  try {
    return localStorage.getItem(GRID_SNAP_KEY) === "on";
  } catch {
    return false;
  }
}

export function saveGridSnap(on: boolean): void {
  try {
    localStorage.setItem(GRID_SNAP_KEY, on ? "on" : "off");
  } catch {
    // same tolerance as the other preferences
  }
}

const AUTO_CLEAR_MANA_KEY = "mtg:auto-clear-mana";

/** Your own pool empties on each phase or turn change (paper MTG drains at
 *  every step) when on. Off by default — the pool is manual bookkeeping. */
export function loadAutoClearMana(): boolean {
  try {
    return localStorage.getItem(AUTO_CLEAR_MANA_KEY) === "on";
  } catch {
    return false;
  }
}

export function saveAutoClearMana(on: boolean): void {
  try {
    localStorage.setItem(AUTO_CLEAR_MANA_KEY, on ? "on" : "off");
  } catch {
    // same tolerance as the other preferences
  }
}
