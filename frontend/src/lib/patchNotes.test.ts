import { describe, expect, it } from "vitest";
import { PATCH_NOTES } from "./patchNotes";

describe("PATCH_NOTES", () => {
  it("has at least one release with at least one item", () => {
    expect(PATCH_NOTES.length).toBeGreaterThan(0);
    for (const release of PATCH_NOTES) {
      expect(release.items.length).toBeGreaterThan(0);
    }
  });

  it("gives every release a non-empty, unique id, label, and ISO date", () => {
    const ids = new Set<string>();
    const labels = new Set<string>();
    for (const release of PATCH_NOTES) {
      expect(release.id).toMatch(/^\S+$/);
      expect(release.label.trim().length).toBeGreaterThan(0);
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      ids.add(release.id);
      labels.add(release.label);
    }
    expect(ids.size).toBe(PATCH_NOTES.length);
    expect(labels.size).toBe(PATCH_NOTES.length);
  });

  it("gives every item a non-empty, unique-within-release title", () => {
    for (const release of PATCH_NOTES) {
      const titles = new Set<string>();
      for (const item of release.items) {
        expect(item.title.trim().length).toBeGreaterThan(0);
        titles.add(item.title);
      }
      expect(titles.size).toBe(release.items.length);
    }
  });

  it("lists releases newest-first (dates non-increasing)", () => {
    for (let i = 1; i < PATCH_NOTES.length; i++) {
      expect(PATCH_NOTES[i - 1].date >= PATCH_NOTES[i].date).toBe(true);
    }
  });
});
