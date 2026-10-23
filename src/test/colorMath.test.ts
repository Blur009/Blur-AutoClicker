import { describe, it, expect } from "vitest";
import {
  hexToRgb,
  hsvToRgb,
  isValidHex,
  normalizeHex,
  rgbToHex,
  rgbToHsv,
} from "../colorMath";

describe("normalizeHex", () => {
  it("lowercases and adds the hash", () => {
    expect(normalizeHex("#ABCDEF")).toBe("#abcdef");
    expect(normalizeHex("abcdef")).toBe("#abcdef");
  });

  it("rejects anything that is not six hex digits", () => {
    expect(normalizeHex("#abc")).toBe("");
    expect(normalizeHex("#abcdef0")).toBe("");
    expect(normalizeHex("not a color")).toBe("");
    expect(normalizeHex(null)).toBe("");
    expect(isValidHex("#12GG00")).toBe(false);
  });
});

describe("hex and rgb conversion", () => {
  it("round-trips through rgb", () => {
    expect(hexToRgb("#1fc24b")).toEqual({ red: 31, green: 194, blue: 75 });
    expect(rgbToHex({ red: 31, green: 194, blue: 75 })).toBe("#1fc24b");
  });

  it("clamps out of range channels", () => {
    expect(rgbToHex({ red: 300, green: -12, blue: 12.6 })).toBe("#ff000d");
  });
});

describe("hsv conversion", () => {
  it("maps the primary hues", () => {
    expect(rgbToHsv({ red: 255, green: 0, blue: 0 }).hue).toBeCloseTo(0);
    expect(rgbToHsv({ red: 0, green: 255, blue: 0 }).hue).toBeCloseTo(120);
    expect(rgbToHsv({ red: 0, green: 0, blue: 255 }).hue).toBeCloseTo(240);
  });

  it("keeps greys unsaturated", () => {
    const hsv = rgbToHsv({ red: 128, green: 128, blue: 128 });
    expect(hsv.saturation).toBe(0);
    expect(hsv.value).toBeCloseTo(128 / 255);
  });

  it("round-trips a color through hsv", () => {
    const rgb = { red: 31, green: 194, blue: 75 };
    expect(hsvToRgb(rgbToHsv(rgb))).toEqual(rgb);
  });

  it("wraps a negative hue", () => {
    expect(hsvToRgb({ hue: -120, saturation: 1, value: 1 })).toEqual({
      red: 0,
      green: 0,
      blue: 255,
    });
  });
});
