import { describe, it, expect } from "vitest";
import {
  FACTORY_PRESETS,
  SETTINGS_LIMITS,
  buildPresetSnapshot,
  createDefaultSettings,
  getMaxClickSpeed,
  sanitizePresetSnapshot,
  sanitizeSettings,
  withFactoryPresets,
} from "../settingsSchema";
import type { Settings } from "../settingsSchema";
import { MAX_THEME_PROFILES, createThemeProfile } from "../themeModel";
import type { ThemeProfile } from "../themeModel";

const VERSION = "3.9.2";

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

describe("extended click speed limit", () => {
  it("raises the maximum click speed only when the extended limit is on", () => {
    expect(getMaxClickSpeed(true)).toBe(1000);
    expect(getMaxClickSpeed(false)).toBe(500);
  });

  it("clamps click speed to the extended maximum only when the extended limit is on", () => {
    const extended = sanitizeSettings(
      { clickSpeed: 800, extendedClickSpeedLimit: true },
      VERSION,
    );
    expect(extended.clickSpeed).toBe(800);

    const standard = sanitizeSettings(
      { clickSpeed: 800, extendedClickSpeedLimit: false },
      VERSION,
    );
    expect(standard.clickSpeed).toBe(500);

    const aboveExtended = sanitizeSettings(
      { clickSpeed: 1500, extendedClickSpeedLimit: true },
      VERSION,
    );
    expect(aboveExtended.clickSpeed).toBe(1000);
  });
});

describe("factory preset restore", () => {
  it("returns the factory presets and clears the active preset", () => {
    const reset = withFactoryPresets({
      ...createDefaultSettings(VERSION),
      presets: [],
      activePresetId: "user-preset",
    });

    expect(reset.presets.map((preset) => preset.name)).toEqual([
      "Standard Clicking",
      "Rapid Fire",
      "Precision Mode",
    ]);
    expect(reset.activePresetId).toBeNull();
  });

  it("keeps every other field of the settings passed in", () => {
    const reset = withFactoryPresets({
      ...createDefaultSettings(VERSION),
      clickSpeed: 40,
      presets: [],
    });

    expect(reset.clickSpeed).toBe(40);
    expect(reset.presets).toEqual(FACTORY_PRESETS);
  });

  it("hands back copies so edits cannot reach the factory list", () => {
    const reset = withFactoryPresets(createDefaultSettings(VERSION));
    const first = reset.presets[0];
    first.name = "Renamed";
    first.settings.clickSpeed = 999;

    expect(FACTORY_PRESETS[0].name).toBe("Standard Clicking");
    expect(FACTORY_PRESETS[0].settings.clickSpeed).toBe(25);
  });
});

const PRESET_SNAPSHOT_DEFAULTS = buildPresetSnapshot(
  createDefaultSettings(VERSION),
);

describe("legacy preset sequence flag stored as a string", () => {
  it("turns a stored string sequenceEnabled into a real boolean", () => {
    const snapshot = sanitizePresetSnapshot(
      { clickSpeed: 25, sequenceEnabled: "true" },
      PRESET_SNAPSHOT_DEFAULTS,
    );

    expect(snapshot.clickPointsEnabled).toBe(true);
  });

  it("reads a stored string sequenceEnabled of false as disabled", () => {
    const snapshot = sanitizePresetSnapshot(
      { sequenceEnabled: "false" },
      PRESET_SNAPSHOT_DEFAULTS,
    );

    expect(snapshot.clickPointsEnabled).toBe(false);
  });

  it("keeps the modern clickPointsEnabled when the preset already has it", () => {
    const snapshot = sanitizePresetSnapshot(
      { clickPointsEnabled: false, sequenceEnabled: "true" },
      PRESET_SNAPSHOT_DEFAULTS,
    );

    expect(snapshot.clickPointsEnabled).toBe(false);
  });
});

describe("legacy preset speed randomisation", () => {
  it("keeps the variation and its toggle from an old preset", () => {
    const snapshot = sanitizePresetSnapshot(
      { speedVariation: 55, speedVariationEnabled: "false" },
      PRESET_SNAPSHOT_DEFAULTS,
    );

    expect(snapshot.speedRandomization).toBe(55);
    expect(snapshot.speedRandomizationEnabled).toBe(false);
  });

  it("uses the old maximum variation when only that field is saved", () => {
    const snapshot = sanitizePresetSnapshot(
      { speedRandomizationMax: 80 },
      PRESET_SNAPSHOT_DEFAULTS,
    );

    expect(snapshot.speedRandomization).toBe(80);
    expect(snapshot.speedRandomizationEnabled).toBe(true);
  });

  it("prefers the modern speed randomisation fields over the old ones", () => {
    const snapshot = sanitizePresetSnapshot(
      {
        speedRandomization: 12,
        speedRandomizationEnabled: false,
        speedVariation: 90,
        speedVariationEnabled: true,
      },
      PRESET_SNAPSHOT_DEFAULTS,
    );

    expect(snapshot.speedRandomization).toBe(12);
    expect(snapshot.speedRandomizationEnabled).toBe(false);
  });
});

describe("legacy sequence flag in the saved settings file", () => {
  it("turns a saved sequenceEnabled into enabled click points", () => {
    const legacy = {
      version: "3.8.0",
      sequenceEnabled: true,
    } as unknown as Partial<Settings>;

    const settings = sanitizeSettings(legacy, VERSION);

    expect(settings.clickPointsEnabled).toBe(true);
  });

  it("prefers the modern clickPointsEnabled when the file has both keys", () => {
    const saved = {
      version: "3.8.0",
      clickPointsEnabled: false,
      sequenceEnabled: true,
    } as unknown as Partial<Settings>;

    const settings = sanitizeSettings(saved, VERSION);

    expect(settings.clickPointsEnabled).toBe(false);
  });
});

describe("legacy custom stop zone on a monitor left of the primary", () => {
  it("keeps the saved negative x and y instead of collapsing to 0", () => {
    const legacy = {
      customStopZoneEnabled: true,
      customStopZoneX: -1920,
      customStopZoneY: -240,
      customStopZoneWidth: 400,
      customStopZoneHeight: 300,
    } as unknown as Partial<Settings>;

    const settings = sanitizeSettings(legacy, VERSION);

    expect(settings.stopZones).toEqual([
      expect.objectContaining({
        x: -1920,
        y: -240,
        width: 400,
        height: 300,
        action: "stop",
      }),
    ]);
  });

  it("keeps a minimum size of 1 for a degenerate legacy zone", () => {
    const legacy = {
      customStopZoneEnabled: true,
      customStopZoneX: -1920,
      customStopZoneY: 0,
      customStopZoneWidth: 0,
      customStopZoneHeight: -50,
    } as unknown as Partial<Settings>;

    const settings = sanitizeSettings(legacy, VERSION);

    expect(settings.stopZones).toEqual([
      expect.objectContaining({ x: -1920, width: 1, height: 1 }),
    ]);
  });

  it("migrates an enabled legacy zone into an enabled stop zone list", () => {
    const legacy = {
      customStopZoneEnabled: true,
      customStopZoneX: 100,
      customStopZoneY: 200,
      customStopZoneWidth: 300,
      customStopZoneHeight: 400,
    } as unknown as Partial<Settings>;

    const settings = sanitizeSettings(legacy, VERSION);

    expect(settings.stopZonesEnabled).toBe(true);
    expect(settings.stopZones).toEqual([
      expect.objectContaining({ action: "stop", width: 300, height: 400 }),
    ]);
  });

  it("keeps the migrated zone enabled after a save and reload", () => {
    const legacy = {
      customStopZoneEnabled: true,
      customStopZoneX: 100,
      customStopZoneY: 200,
      customStopZoneWidth: 300,
      customStopZoneHeight: 400,
    } as unknown as Partial<Settings>;

    const saved = sanitizeSettings(legacy, VERSION);
    const reloaded = sanitizeSettings(saved, VERSION);

    expect(reloaded.stopZonesEnabled).toBe(true);
    expect(reloaded.stopZones).toHaveLength(1);
    expect(reloaded.stopZones[0].action).toBe("stop");
  });

  it("leaves stop zones disabled for a legacy zone that was switched off", () => {
    const legacy = {
      customStopZoneEnabled: false,
      customStopZoneX: 100,
      customStopZoneY: 200,
      customStopZoneWidth: 300,
      customStopZoneHeight: 400,
    } as unknown as Partial<Settings>;

    const settings = sanitizeSettings(legacy, VERSION);

    expect(settings.stopZonesEnabled).toBe(false);
    expect(settings.stopZones).toEqual([]);
  });
});

describe("duty cycle hold mode settings", () => {
  it("pins one click per day in both representations", () => {
    const saved = {
      dutyCycleMode: "Hold",
      durationHours: 0,
      durationMinutes: 0,
      durationSeconds: 2,
      durationMilliseconds: 500,
      clickSpeed: 25,
      clickInterval: "s",
      dutyCycle: 45,
    } as unknown as Partial<Settings>;

    const settings = sanitizeSettings(saved, VERSION);

    expect(settings.clickSpeed).toBe(1);
    expect(settings.clickInterval).toBe("d");
    expect(settings.dutyCycle).toBe(100);
    expect(settings.durationHours).toBe(24);
    expect(settings.durationMinutes).toBe(0);
    expect(settings.durationSeconds).toBe(0);
    expect(settings.durationMilliseconds).toBe(0);
    expect(settings.savedDurationMs).toBe(2500);
  });

  it("keeps the saved interval used when leaving hold mode", () => {
    const saved = {
      dutyCycleMode: "Hold",
      savedDurationMs: 2500,
      savedClickSpeed: 12,
      savedClickInterval: "m",
      savedDutyCycle: 60,
    } as unknown as Partial<Settings>;

    const settings = sanitizeSettings(saved, VERSION);

    expect(settings.savedDurationMs).toBe(2500);
    expect(settings.savedClickSpeed).toBe(12);
    expect(settings.savedClickInterval).toBe("m");
    expect(settings.savedDutyCycle).toBe(60);
  });
});

describe("custom theme settings", () => {
  const profile = createThemeProfile(
    "dark",
    "#22c55e",
    "Custom 1",
    "theme-1",
    1,
  );

  it("defaults to the dark theme with no profiles and no active theme", () => {
    const defaults = createDefaultSettings(VERSION);

    expect(defaults.theme).toBe("dark");
    expect(defaults.themeProfiles).toEqual([]);
    expect(defaults.activeThemeProfileId).toBe("");
  });

  it("keeps a custom theme together with its active profile", () => {
    const settings = sanitizeSettings(
      {
        theme: "custom",
        themeProfiles: [profile],
        activeThemeProfileId: "theme-1",
      },
      VERSION,
    );

    expect(settings.theme).toBe("custom");
    expect(settings.themeProfiles).toHaveLength(1);
    expect(settings.activeThemeProfileId).toBe("theme-1");
  });

  it("falls back to the dark theme when custom mode has no profile", () => {
    const settings = sanitizeSettings({ theme: "custom" }, VERSION);

    expect(settings.theme).toBe("dark");
    expect(settings.activeThemeProfileId).toBe("");
    expect(settings.themeProfiles).toEqual([]);
  });

  it("clears an active id that matches no surviving profile", () => {
    const settings = sanitizeSettings(
      {
        theme: "custom",
        themeProfiles: [profile],
        activeThemeProfileId: "missing",
      },
      VERSION,
    );

    expect(settings.theme).toBe("dark");
    expect(settings.activeThemeProfileId).toBe("");
    expect(settings.themeProfiles).toHaveLength(1);
  });

  it("clamps profile token values and caps the profile list", () => {
    const many = Array.from(
      { length: MAX_THEME_PROFILES + 10 },
      (_, index) => ({
        ...profile,
        id: `theme-${index}`,
        tokens: { ...profile.tokens, accent: { hex: "#22c55e", alpha: 9 } },
      }),
    );

    const settings = sanitizeSettings({ themeProfiles: many }, VERSION);

    expect(settings.themeProfiles).toHaveLength(MAX_THEME_PROFILES);
    expect(settings.themeProfiles[0].tokens.accent.alpha).toBe(1);
  });

  it("drops profile entries without a usable id", () => {
    const invalid = [
      { ...profile, id: 5 },
      { ...profile, id: "theme-1" },
    ] as unknown as ThemeProfile[];

    const settings = sanitizeSettings({ themeProfiles: invalid }, VERSION);

    expect(settings.themeProfiles.map((entry) => entry.id)).toEqual([
      "theme-1",
    ]);
  });

  it("always returns a fresh profile array", () => {
    const defaults = createDefaultSettings(VERSION);
    const settings = sanitizeSettings({}, VERSION);

    expect(settings.themeProfiles).not.toBe(defaults.themeProfiles);

    settings.themeProfiles.push(
      createThemeProfile("dark", "#22c55e", "X", "x", 1),
    );

    expect(defaults.themeProfiles).toHaveLength(0);
    expect(createDefaultSettings(VERSION).themeProfiles).toHaveLength(0);
  });

  it("gives every default settings call its own array fields", () => {
    const first = createDefaultSettings(VERSION);
    first.themeProfiles.push(
      createThemeProfile("dark", "#22c55e", "X", "x", 1),
    );

    const second = createDefaultSettings(VERSION);

    expect(second.themeProfiles).toHaveLength(0);
  });
});

describe("sound settings", () => {
  it("defaults both sounds to on, 50% each, master at 100%", () => {
    const defaults = createDefaultSettings(VERSION);

    expect(defaults.enableSoundEnabled).toBe(true);
    expect(defaults.disableSoundEnabled).toBe(true);
    expect(defaults.enableSoundVolume).toBe(50);
    expect(defaults.disableSoundVolume).toBe(50);
    expect(defaults.soundVolume).toBe(100);
    expect(defaults.soundMuted).toBe(false);
    expect(defaults.enableSoundPath).toBe("");
    expect(defaults.disableSoundPath).toBe("");
  });

  it("fills sound keys for settings saved before sounds existed", () => {
    const legacy: Partial<Settings> = {
      version: "3.9.5",
      clickSpeed: 25,
      clickInterval: "s",
    };
    const sanitized = sanitizeSettings(legacy, VERSION);

    expect(sanitized.enableSoundEnabled).toBe(true);
    expect(sanitized.disableSoundEnabled).toBe(true);
    expect(sanitized.soundVolume).toBe(100);
    expect(sanitized.enableSoundPath).toBe("");
  });

  it("clamps sound volumes to 0-100", () => {
    const tooHigh = sanitizeSettings(
      { soundVolume: 400, enableSoundVolume: 150 },
      VERSION,
    );
    expect(tooHigh.soundVolume).toBe(100);
    expect(tooHigh.enableSoundVolume).toBe(100);

    const tooLow = sanitizeSettings(
      { soundVolume: -20, disableSoundVolume: -1 },
      VERSION,
    );
    expect(tooLow.soundVolume).toBe(0);
    expect(tooLow.disableSoundVolume).toBe(0);
  });

  it("keeps a custom sound path and rejects non-string values", () => {
    const kept = sanitizeSettings(
      { enableSoundPath: "C:\\Sounds\\pop.wav" },
      VERSION,
    );
    expect(kept.enableSoundPath).toBe("C:\\Sounds\\pop.wav");

    const rejected = sanitizeSettings(
      { disableSoundPath: 42 as unknown as string },
      VERSION,
    );
    expect(rejected.disableSoundPath).toBe("");
  });
});

describe("interface scale setting", () => {
  it("defaults to 100 percent", () => {
    expect(createDefaultSettings(VERSION).uiScale).toBe(100);
  });

  it("registers a 25-300 limit", () => {
    expect(SETTINGS_LIMITS.uiScale).toEqual({ min: 25, max: 300 });
  });

  it("clamps saved values into range", () => {
    expect(sanitizeSettings({ uiScale: 900 }, VERSION).uiScale).toBe(300);
    expect(sanitizeSettings({ uiScale: 1 }, VERSION).uiScale).toBe(25);
    expect(sanitizeSettings({ uiScale: 175 }, VERSION).uiScale).toBe(175);
  });

  it("stays out of preset snapshots", () => {
    const snapshot = buildPresetSnapshot(createDefaultSettings(VERSION));
    expect("uiScale" in snapshot).toBe(false);
  });
});
