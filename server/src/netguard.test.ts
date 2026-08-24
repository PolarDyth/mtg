import { describe, expect, it } from "vitest";
import { originAllowed, resolveClientIp, sanitizeRequestUrl } from "./netguard";

describe("originAllowed", () => {
  it("allows requests without an Origin header (non-browser clients)", () => {
    expect(originAllowed(undefined, "example.com", [])).toBe(true);
  });

  it("allows same-host origins (case-insensitive, port included)", () => {
    expect(originAllowed("https://example.com", "example.com", [])).toBe(true);
    expect(originAllowed("http://Example.com:3000", "example.com:3000", [])).toBe(true);
  });

  it("rejects cross-origin upgrades", () => {
    expect(originAllowed("https://evil.example", "example.com", [])).toBe(false);
    expect(originAllowed("https://example.com:8080", "example.com:3000", [])).toBe(false);
    expect(originAllowed("http://localhost:3000", "example.com", [])).toBe(false);
  });

  it("rejects null and malformed origins", () => {
    expect(originAllowed("null", "example.com", [])).toBe(false);
    expect(originAllowed("not a url", "example.com", [])).toBe(false);
    expect(originAllowed("ftp://example.com", "example.com", [])).toBe(false);
  });

  it("honors the explicit allowlist (exact origin match)", () => {
    expect(originAllowed("https://mtg.example", "example.com", ["https://mtg.example"])).toBe(true);
    expect(originAllowed("https://fake.example", "example.com", ["https://mtg.example"])).toBe(false);
  });

  it("rejects when there is no Host header to compare against", () => {
    expect(originAllowed("https://example.com", undefined, [])).toBe(false);
  });
});

describe("resolveClientIp", () => {
  it("ignores X-Forwarded-For with zero trusted hops (the default)", () => {
    expect(
      resolveClientIp({ "x-forwarded-for": "1.2.3.4" }, "203.0.113.9", 0)
    ).toBe("203.0.113.9");
  });

  it("takes the rightmost entry with one trusted hop", () => {
    expect(
      resolveClientIp({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }, "10.0.0.1", 1)
    ).toBe("5.6.7.8");
  });

  it("takes the n-th entry from the right for multi-hop chains", () => {
    expect(
      resolveClientIp({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" }, "10.0.0.1", 2)
    ).toBe("2.2.2.2");
  });

  it("falls back to the socket address when the list is too short or missing", () => {
    expect(resolveClientIp({ "x-forwarded-for": "1.2.3.4" }, "10.0.0.1", 3)).toBe("10.0.0.1");
    expect(resolveClientIp({}, "10.0.0.1", 1)).toBe("10.0.0.1");
  });

  it("handles array-form headers and empty entries", () => {
    expect(
      resolveClientIp({ "x-forwarded-for": ["1.2.3.4", "5.6.7.8"] }, "10.0.0.1", 1)
    ).toBe("5.6.7.8");
    expect(resolveClientIp({ "x-forwarded-for": ", ," }, "10.0.0.1", 1)).toBe("10.0.0.1");
  });
});

describe("sanitizeRequestUrl", () => {
  it("passes URLs without % through unchanged", () => {
    expect(sanitizeRequestUrl("/game/FOO-BAR-1234")).toBe("/game/FOO-BAR-1234");
  });

  it("passes valid escapes through unchanged (path and query)", () => {
    expect(sanitizeRequestUrl("/game/PLAIN-ISLAND-0042?x=%20foo%2Fbar")).toBe(
      "/game/PLAIN-ISLAND-0042?x=%20foo%2Fbar"
    );
  });

  it("canonicalizes bare % to %25", () => {
    expect(sanitizeRequestUrl("/game/%ZZ")).toBe("/game/%25ZZ");
    expect(sanitizeRequestUrl("/100%")).toBe("/100%25");
  });

  it("canonicalizes truncated escapes, leaving valid neighbors intact", () => {
    expect(sanitizeRequestUrl("/game/%E4%BD")).toBe("/game/%25E4%25BD");
    expect(sanitizeRequestUrl("/a%zz%41")).toBe("/a%25zz%41");
  });

  it("handles a lone trailing %", () => {
    expect(sanitizeRequestUrl("/game/%")).toBe("/game/%25");
  });

  it("never throws and always yields a decodable URL", () => {
    for (const raw of ["/%", "/%%%", "/%G1", "/x%zz?q=%", "/%E4%BD"]) {
      expect(() => decodeURIComponent(sanitizeRequestUrl(raw))).not.toThrow();
    }
  });
});
