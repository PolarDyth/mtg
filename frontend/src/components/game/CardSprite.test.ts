import { describe, expect, it } from "vitest";
import { counterChipText } from "./CardSprite";

describe("counterChipText", () => {
  it("reads power counters as their total modifier", () => {
    expect(counterChipText("+1/+1", 1)).toBe("+1/+1");
    expect(counterChipText("+1/+1", 3)).toBe("+3/+3");
    expect(counterChipText("-1/-1", 2)).toBe("−2/−2");
  });

  it("counts units for other kinds, truncating long names", () => {
    expect(counterChipText("Lore", 2)).toBe("Lore ×2");
    expect(counterChipText("Stun", 5)).toBe("Stun ×5");
    // >4 chars truncates to three + ellipsis ("Shield" → "Shi…")
    expect(counterChipText("Shield", 1)).toBe("Shi… ×1");
    expect(counterChipText("Charge counters", 2)).toBe("Cha… ×2");
  });
});
