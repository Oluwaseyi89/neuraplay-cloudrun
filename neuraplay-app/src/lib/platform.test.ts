import { describe, expect, it } from "vitest";
import { getBrowserType, getPlatformType } from "./platform";

const UA = {
  desktopChrome: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  desktopEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  androidTablet: "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
};

describe("getPlatformType", () => {
  it("detects desktop and mobile", () => {
    expect(getPlatformType(UA.desktopChrome)).toBe("desktop");
    expect(getPlatformType(UA.androidChrome)).toBe("mobile");
    expect(getPlatformType(UA.iphoneSafari)).toBe("mobile");
  });

  it("treats Android tablets as mobile (both use the HTTP upload path)", () => {
    expect(getPlatformType(UA.androidTablet)).toBe("mobile");
  });
});

describe("getBrowserType", () => {
  it("tells Chrome, Edge and Safari apart", () => {
    expect(getBrowserType(UA.desktopChrome)).toBe("chrome");
    expect(getBrowserType(UA.desktopEdge)).toBe("edge");
    expect(getBrowserType(UA.iphoneSafari)).toBe("safari");
  });
});
