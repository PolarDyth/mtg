import { describe, expect, it } from "vitest";
import { decodeRoomCode } from "./roomCode";

describe("decodeRoomCode", () => {
  it("decodes, trims, and uppercases a normal code", () => {
    expect(decodeRoomCode("foo-bar-1234")).toBe("FOO-BAR-1234");
  });

  it("passes an already-normalized code through", () => {
    expect(decodeRoomCode("FOO-BAR-1234")).toBe("FOO-BAR-1234");
  });

  it("never throws on invalid escapes (SEC-14: /game/%ZZ must not 500)", () => {
    expect(decodeRoomCode("%ZZ")).toBe("%ZZ");
  });

  it("never throws on truncated escapes", () => {
    expect(decodeRoomCode("%E4%BD")).toBe("%E4%BD");
  });

  it("trims surrounding whitespace", () => {
    expect(decodeRoomCode(" foo-bar-1234 ")).toBe("FOO-BAR-1234");
  });
});
