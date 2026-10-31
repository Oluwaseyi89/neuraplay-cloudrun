import { describe, expect, it } from "vitest";
import { secondsUntilExpiry } from "./jwt";

const makeToken = (payload: object): string => {
  const base64url = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url(payload)}.signature`;
};

describe("secondsUntilExpiry", () => {
  const now = 1_700_000_000_000;

  it("returns seconds left before exp", () => {
    expect(secondsUntilExpiry(makeToken({ exp: now / 1000 + 300 }), now)).toBe(300);
  });

  it("is negative for an expired token", () => {
    expect(secondsUntilExpiry(makeToken({ exp: now / 1000 - 10 }), now)).toBe(-10);
  });

  it("returns null for malformed tokens or a missing exp", () => {
    expect(secondsUntilExpiry("not-a-jwt", now)).toBeNull();
    expect(secondsUntilExpiry(makeToken({ user_id: 1 }), now)).toBeNull();
  });
});
