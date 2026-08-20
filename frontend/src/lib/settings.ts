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
