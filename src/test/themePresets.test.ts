import { describe, expect, it } from "vitest";
import {
  THEME_COLOR_TOKENS,
  THEME_PALETTES,
  type ThemeColor,
} from "../themeModel";
import {
  THEME_PRESETS,
  THEME_PRESET_CATEGORIES,
  type ThemePreset,
  type ThemePresetCategory,
} from "../themePresets";

const HEX_PATTERN = /^#[0-9a-f]{6}$/;

const NON_COLOR_TOKEN_KEYS = [
  "radiusSmRem",
  "radiusMdRem",
  "radiusLgRem",
  "radiusWindowPx",
  "shadowContainer",
  "shadowModal",
] as const;

const FAMILY_CATEGORIES = new Map<string, ThemePresetCategory>([
  ["macos", "system"],
  ["windows", "system"],
  ["github", "apps"],
  ["discord", "apps"],
  ["spotify", "apps"],
  ["catppuccin", "palettes"],
  ["solarized", "palettes"],
  ["nord", "palettes"],
]);

function channel(hex: string, index: number): number {
  return parseInt(hex.slice(index * 2 + 1, index * 2 + 3), 16);
}

function composite(color: ThemeColor, background: string): string {
  const channels = [0, 1, 2].map((index) =>
    Math.round(
      channel(color.hex, index) * color.alpha +
        channel(background, index) * (1 - color.alpha),
    ),
  );
  return `#${channels
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function luminance(hex: string): number {
  const [red, green, blue] = [0, 1, 2].map((index) => {
    const value = channel(hex, index) / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastOn(
  color: ThemeColor,
  background: ThemeColor,
  baseHex: string,
): number {
  const surface = composite(background, baseHex);
  const text = composite(color, surface);
  const lighter = Math.max(luminance(text), luminance(surface));
  const darker = Math.min(luminance(text), luminance(surface));
  return (lighter + 0.05) / (darker + 0.05);
}

function familyCategory(preset: ThemePreset): ThemePresetCategory {
  const family = preset.id.split("-")[0];
  const category = FAMILY_CATEGORIES.get(family);
  if (!category) {
    throw new Error(`Unknown preset family: ${family}`);
  }
  return category;
}

describe("theme presets", () => {
  it("ships every researched variant with a unique id", () => {
    expect(THEME_PRESETS.length).toBeGreaterThanOrEqual(18);
    expect(new Set(THEME_PRESETS.map((preset) => preset.id)).size).toBe(
      THEME_PRESETS.length,
    );
    expect(new Set(THEME_PRESETS.map((preset) => preset.name)).size).toBe(
      THEME_PRESETS.length,
    );
  });

  it("orders the categories with their display labels", () => {
    expect(THEME_PRESET_CATEGORIES).toEqual([
      { id: "system", label: "System" },
      { id: "apps", label: "Apps" },
      { id: "palettes", label: "Color palettes" },
    ]);
  });

  it.each(THEME_PRESETS)("$name defines every token", (preset) => {
    for (const meta of THEME_COLOR_TOKENS) {
      expect(preset.tokens[meta.key].hex).toMatch(HEX_PATTERN);
      expect(preset.tokens[meta.key].alpha).toBeGreaterThanOrEqual(0);
      expect(preset.tokens[meta.key].alpha).toBeLessThanOrEqual(1);
    }

    expect(Object.keys(preset.tokens)).toHaveLength(
      THEME_COLOR_TOKENS.length + NON_COLOR_TOKEN_KEYS.length,
    );
  });

  it.each(THEME_PRESETS)(
    "$name keeps radii ordered and shadows bounded",
    (preset) => {
      expect(preset.tokens.radiusSmRem).toBeLessThanOrEqual(
        preset.tokens.radiusMdRem,
      );
      expect(preset.tokens.radiusMdRem).toBeLessThanOrEqual(
        preset.tokens.radiusLgRem,
      );
      expect(preset.tokens.radiusWindowPx).toBeGreaterThan(0);

      for (const shadow of [
        preset.tokens.shadowContainer,
        preset.tokens.shadowModal,
      ]) {
        if (!shadow) continue;
        expect(shadow.offsetY).toBeGreaterThanOrEqual(0);
        expect(shadow.offsetY).toBeLessThanOrEqual(40);
        expect(shadow.blur).toBeGreaterThanOrEqual(0);
        expect(shadow.blur).toBeLessThanOrEqual(96);
        expect(shadow.alpha).toBeGreaterThanOrEqual(0);
        expect(shadow.alpha).toBeLessThanOrEqual(1);
      }
    },
  );

  it.each(THEME_PRESETS)("$name has a valid base and category", (preset) => {
    expect(["dark", "light"]).toContain(preset.base);
    expect(THEME_PRESET_CATEGORIES.map((category) => category.id)).toContain(
      preset.category,
    );
    expect(preset.category).toBe(familyCategory(preset));
  });

  it.each(THEME_PRESETS)("$name keeps the text hierarchy", (preset) => {
    const baseHex = preset.tokens.bgBase.hex;
    const background = preset.tokens.bgSurface;
    const primary = contrastOn(preset.tokens.textPrimary, background, baseHex);
    const muted = contrastOn(preset.tokens.textMuted, background, baseHex);
    const dim = contrastOn(preset.tokens.textDim, background, baseHex);

    expect(primary).toBeGreaterThan(muted);
    expect(muted).toBeGreaterThan(dim);
  });

  it.each(THEME_PRESETS)(
    "$name keeps accent readable on the base",
    (preset) => {
      expect(
        contrastOn(
          preset.tokens.accent,
          preset.tokens.bgBase,
          preset.tokens.bgBase.hex,
        ),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(THEME_PRESETS)(
    "$name keeps dim text readable on its surface",
    (preset) => {
      expect(
        contrastOn(
          preset.tokens.textDim,
          preset.tokens.bgSurface,
          preset.tokens.bgBase.hex,
        ),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(THEME_PRESETS)(
    "$name keeps the update banner text readable",
    (preset) => {
      const baseHex = preset.tokens.bgBase.hex;
      expect(
        contrastOn(preset.tokens.bannerTitle, preset.tokens.bannerBg, baseHex),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastOn(preset.tokens.bannerButton, preset.tokens.bannerBg, baseHex),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(THEME_PRESETS)(
    "$name keeps borders and dividers visible on panels",
    (preset) => {
      const baseHex = preset.tokens.bgBase.hex;
      expect(
        contrastOn(
          preset.tokens.borderSubtle,
          preset.tokens.bgSurface,
          baseHex,
        ),
      ).toBeGreaterThanOrEqual(1.2);
      expect(
        contrastOn(preset.tokens.divider, preset.tokens.bgSurface, baseHex),
      ).toBeGreaterThanOrEqual(1.2);
      expect(preset.tokens.divider).toEqual(preset.tokens.borderSubtle);
    },
  );
});

describe("built-in theme palettes", () => {
  it.each(Object.entries(THEME_PALETTES))(
    "%s palette keeps text contrast with the built-in accent exempt from the 3:1 accent rule",
    (_base, tokens) => {
      const baseHex = tokens.bgBase.hex;
      const background = tokens.bgSurface;
      const primary = contrastOn(tokens.textPrimary, background, baseHex);
      const muted = contrastOn(tokens.textMuted, background, baseHex);
      const dim = contrastOn(tokens.textDim, background, baseHex);

      expect(primary).toBeGreaterThan(muted);
      expect(muted).toBeGreaterThan(dim);
      expect(dim).toBeGreaterThanOrEqual(3);
      expect(
        contrastOn(tokens.bannerTitle, tokens.bannerBg, baseHex),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastOn(tokens.bannerButton, tokens.bannerBg, baseHex),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});
