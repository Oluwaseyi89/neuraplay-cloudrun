import { describe, expect, it } from "vitest";
import { detectWakeIntent, getWakePrompt, similarity } from "./wakePhrases";

const DESKTOP_THRESHOLD = 0.65;

describe("detectWakeIntent", () => {
  it.each(["hey fifa", "Hey FIFA!", "okay fifa start", "ea fc"])("wakes the FIFA panel for %j", (heard) => {
    expect(detectWakeIntent(heard, "fifa", DESKTOP_THRESHOLD)).toBe(true);
  });

  it.each(["hey lol", "league of legends", "hey league"])("wakes the LoL panel for %j", (heard) => {
    expect(detectWakeIntent(heard, "lol", DESKTOP_THRESHOLD)).toBe(true);
  });

  it.each(["hey league", "yeah really great team", "the season is long"])(
    "does not wake FIFA for words merely containing 'ea' (%j)",
    (heard) => {
      expect(detectWakeIntent(heard, "fifa", DESKTOP_THRESHOLD)).toBe(false);
    }
  );

  it("does not wake LoL for FIFA phrases", () => {
    expect(detectWakeIntent("hey fifa", "lol", DESKTOP_THRESHOLD)).toBe(false);
  });

  it("accepts close mishearings of a short phrase", () => {
    expect(detectWakeIntent("hey fifo", "fifa", DESKTOP_THRESHOLD)).toBe(true);
  });

  it("ignores empty or punctuation-only input", () => {
    expect(detectWakeIntent("", "fifa", DESKTOP_THRESHOLD)).toBe(false);
    expect(detectWakeIntent("?!", "lol", DESKTOP_THRESHOLD)).toBe(false);
  });
});

describe("similarity", () => {
  it("is 1 for identical strings and 0 for empty input", () => {
    expect(similarity("fifa", "FIFA")).toBe(1);
    expect(similarity("", "fifa")).toBe(0);
  });
});

describe("getWakePrompt", () => {
  it("uses the game's primary phrase", () => {
    expect(getWakePrompt("fifa")).toBe("Say 'hey fifa'");
    expect(getWakePrompt("lol")).toBe("Say 'hey lol'");
  });
});
