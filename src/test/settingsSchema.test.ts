import { describe, it, expect } from "vitest";
import {
  SETTINGS_LIMITS,
  buildPresetSnapshot,
  createDefaultSettings,
  sanitizePresetSnapshot,
  sanitizeSettings,
} from "../settingsSchema";
import type { Settings } from "../settingsSchema";

const VERSION = "3.9.2";

function sanitizeLegacy(value: Record<string, unknown>) {
  return sanitizeSettings(value as unknown as Partial<Settings>, VERSION);
}

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

describe("legacy settings migrations", () => {
  it("migrates sequence and speed variation in saved presets", () => {
    const sanitized = sanitizePresetSnapshot(
      {
        sequenceEnabled: true,
        sequencePoints: [
          { id: "legacy", x: -120, y: 80, clicks: 3, radius: 4 },
        ],
        speedVariation: 37,
        speedVariationEnabled: true,
      },
      buildPresetSnapshot(createDefaultSettings(VERSION)),
    );

    expect(sanitized.clickPointsEnabled).toBe(true);
    expect(sanitized.clickPoints[0].x).toBe(-120);
    expect(sanitized.speedRandomization).toBe(37);
    expect(sanitized.speedRandomizationEnabled).toBe(true);
  });

  it("preserves explicit current values over legacy aliases", () => {
    const input = {
      clickPointsEnabled: false,
      sequenceEnabled: true,
      clickPoints: [],
      sequencePoints: [{ id: "legacy", x: 1, y: 2 }],
      speedRandomization: 0,
      speedVariation: 37,
      speedRandomizationEnabled: false,
      speedVariationEnabled: true,
    };
    const settings = sanitizeLegacy(input);
    const preset = sanitizePresetSnapshot(
      input,
      buildPresetSnapshot(createDefaultSettings(VERSION)),
    );

    for (const sanitized of [settings, preset]) {
      expect(sanitized.clickPointsEnabled).toBe(false);
      expect(sanitized.clickPoints).toEqual([]);
      expect(sanitized.speedRandomization).toBe(0);
      expect(sanitized.speedRandomizationEnabled).toBe(false);
    }
  });

  it("rejects malformed legacy flags and clamps preset variation", () => {
    const sanitized = sanitizePresetSnapshot(
      {
        sequenceEnabled: "true",
        speedVariationEnabled: 0,
        speedVariation: Number.MAX_SAFE_INTEGER,
      },
      buildPresetSnapshot(createDefaultSettings(VERSION)),
    );

    expect(sanitized.clickPointsEnabled).toBe(false);
    expect(sanitized.speedRandomizationEnabled).toBe(
      createDefaultSettings(VERSION).speedRandomizationEnabled,
    );
    expect(sanitized.speedRandomization).toBe(
      SETTINGS_LIMITS.speedRandomization.max,
    );
  });

  it("migrates sequenceEnabled and sequencePoints", () => {
    const sanitized = sanitizeLegacy({
      sequenceEnabled: true,
      sequencePoints: [{ id: "legacy", x: -120, y: 80, clicks: 3, radius: 4 }],
    });

    expect(sanitized.clickPointsEnabled).toBe(true);
    expect(sanitized.clickPoints).toEqual([
      { id: "legacy", x: -120, y: 80, clicks: 3, radius: 4 },
    ]);
  });

  it("migrates legacy speed variation fields", () => {
    const sanitized = sanitizeLegacy({
      speedVariation: 37,
      speedVariationEnabled: true,
    });

    expect(sanitized.speedRandomization).toBe(37);
    expect(sanitized.speedRandomizationEnabled).toBe(true);
  });

  it("preserves negative legacy stop-zone coordinates and clamps dimensions", () => {
    const sanitized = sanitizeLegacy({
      customStopZoneEnabled: true,
      customStopZoneX: -1920,
      customStopZoneY: -200,
      customStopZoneWidth: Number.MAX_SAFE_INTEGER,
      customStopZoneHeight: Number.MAX_SAFE_INTEGER,
    });

    expect(sanitized.stopZones).toHaveLength(1);
    expect(sanitized.stopZones[0]).toMatchObject({
      x: -1920,
      y: -200,
      width: 2_147_483_647,
      height: 2_147_483_647,
      action: "stop",
    });
  });
});
