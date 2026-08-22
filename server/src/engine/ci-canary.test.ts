// TEMPORARY canary: verifies the CI test job actually gates merges. Reverted
// immediately after the red run is observed.
import { describe, expect, it } from "vitest";

describe("CI canary (deliberate break)", () => {
  it("fails on purpose", () => {
    expect(true).toBe(false);
  });
});
