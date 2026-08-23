import { describe, it, expect } from "vitest";
import {
  SETTINGS_LIMITS,
  createDefaultSettings,
  sanitizeSettings,
} from "../settingsSchema";
import { getEffectiveClicksPerSecond } from "../cadence";
import type { Settings } from "../settingsSchema";

const VERSION = "3.9.2";

describe("click speed", () => {
  it("does not cap saved CPS values", () => {
    const sanitized = sanitizeSettings({ clickSpeed: 250_000 }, VERSION);
    expect(sanitized.clickSpeed).toBe(250_000);
    expect(SETTINGS_LIMITS.clickSpeed.max).toBeUndefined();
  });

  it("does not round effective CPS down to the old 1000 CPS ceiling", () => {
    const settings = createDefaultSettings(VERSION);
    settings.clickSpeed = 250_000;
    settings.clickInterval = "s";
    expect(getEffectiveClicksPerSecond(settings)).toBe(250_000);
  });

  it("still rejects zero and negative CPS values", () => {
    expect(sanitizeSettings({ clickSpeed: 0 }, VERSION).clickSpeed).toBe(1);
    expect(sanitizeSettings({ clickSpeed: -50 }, VERSION).clickSpeed).toBe(1);
  });
});

describe("background blur settings", () => {
  const BLUR_FIELDS = [
    "backgroundBlur",
    "backgroundBlurSimple",
    "backgroundBlurAdvanced",
    "backgroundBlurZones",
    "backgroundBlurClickPoints",
    "backgroundBlurSettings",
  ] as const;

  it("defaults all background blur fields to 0", () => {
    const defaults = createDefaultSettings(VERSION);
    for (const field of BLUR_FIELDS) {
      expect(defaults[field]).toBe(0);
    }
  });

  it("registers a 0-20 limit for all background blur fields", () => {
    for (const field of BLUR_FIELDS) {
      const limit = SETTINGS_LIMITS[field];
      expect(limit.min).toBe(0);
      expect(limit.max).toBe(20);
    }
  });

  it("fills missing background blur keys with 0 for legacy saved settings", () => {
    const legacy: Partial<Settings> = {
      version: "3.9.1",
      clickSpeed: 25,
      clickInterval: "s",
      panelBlur: 5,
    };
    const sanitized = sanitizeSettings(legacy, VERSION);
    for (const field of BLUR_FIELDS) {
      expect(sanitized[field]).toBe(0);
    }
  });

  it("clamps out-of-range background blur values", () => {
    const tooHigh = sanitizeSettings({ backgroundBlur: 50 }, VERSION);
    expect(tooHigh.backgroundBlur).toBe(20);

    const tooLow = sanitizeSettings({ backgroundBlur: -5 }, VERSION);
    expect(tooLow.backgroundBlur).toBe(0);

    const valid = sanitizeSettings({ backgroundBlur: 8 }, VERSION);
    expect(valid.backgroundBlur).toBe(8);
  });

  it("clamps per-page background blur fields independently", () => {
    const sanitized = sanitizeSettings(
      { backgroundBlurSimple: 99, backgroundBlurSettings: -1 },
      VERSION,
    );
    expect(sanitized.backgroundBlurSimple).toBe(20);
    expect(sanitized.backgroundBlurSettings).toBe(0);
  });
});
