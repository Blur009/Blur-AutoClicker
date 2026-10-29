import { describe, expect, it } from "vitest";
import {
  MAX_THEME_PROFILES,
  THEME_ACCENT_ALPHAS,
  THEME_COLOR_TOKENS,
  THEME_PALETTES,
  applyThemeTokens,
  clearThemeTokens,
  cloneThemeTokens,
  createThemeProfile,
  createThemeProfileFromPreset,
  resolveThemeTokens,
  sanitizeThemeProfiles,
  sanitizeThemeTokens,
  themeBaseOf,
} from "../themeModel";

function fakeElement(): HTMLElement {
  return document.createElement("div");
}

describe("theme palettes", () => {
  it.each(["dark", "light"] as const)(
    "defines every color token, radii and shadows for the %s palette",
    (base) => {
      const palette = THEME_PALETTES[base];

      for (const meta of THEME_COLOR_TOKENS) {
        expect(palette[meta.key].hex).toMatch(/^#[0-9a-f]{6}$/);
        expect(palette[meta.key].alpha).toBeGreaterThanOrEqual(0);
        expect(palette[meta.key].alpha).toBeLessThanOrEqual(1);
      }

      expect(palette.radiusSmRem).toBeGreaterThan(0);
      expect(palette.radiusMdRem).toBeGreaterThan(0);
      expect(palette.radiusLgRem).toBeGreaterThan(0);
      expect(palette.radiusWindowPx).toBeGreaterThan(0);
      expect(palette.shadowModal).not.toBeNull();
    },
  );
});

describe("resolveThemeTokens", () => {
  it("applies the saved accent on top of the dark palette", () => {
    const tokens = resolveThemeTokens("dark", null, "#123456");

    expect(tokens.accent).toEqual({
      hex: "#123456",
      alpha: THEME_PALETTES.dark.accent.alpha,
    });
    expect(tokens.bgBase).toEqual(THEME_PALETTES.dark.bgBase);
    expect(tokens.border).toEqual(THEME_PALETTES.dark.border);
  });

  it("applies the saved accent on top of the light palette", () => {
    const tokens = resolveThemeTokens("light", null, "#abcdef");

    expect(tokens.accent).toEqual({
      hex: "#abcdef",
      alpha: THEME_PALETTES.light.accent.alpha,
    });
    expect(tokens.bgBase).toEqual(THEME_PALETTES.light.bgBase);
  });

  it("returns a copy that cannot mutate the shared palette", () => {
    const tokens = resolveThemeTokens("light", null, "#123456");

    tokens.bgBase.hex = "#000000";

    expect(THEME_PALETTES.light.bgBase.hex).not.toBe("#000000");
  });

  it("uses the profile tokens and ignores the accent setting in custom mode", () => {
    const profile = createThemeProfile("light", "#ff0000", "Mine", "p1", 1);
    profile.tokens.bgSurface = { hex: "#101010", alpha: 1 };

    const tokens = resolveThemeTokens("custom", profile, "#00ff00");

    expect(tokens.bgSurface).toEqual({ hex: "#101010", alpha: 1 });
    expect(tokens.accent.hex).toBe("#ff0000");
  });

  it("hands back an independent copy of a custom profile", () => {
    const profile = createThemeProfile("dark", "#22c55e", "Mine", "p1", 1);

    const tokens = resolveThemeTokens("custom", profile, "#000000");
    tokens.bgBase.hex = "#000000";

    expect(profile.tokens.bgBase.hex).not.toBe("#000000");
  });

  it("falls back to the dark palette when custom mode has no profile", () => {
    const tokens = resolveThemeTokens("custom", null, "#123456");

    expect(tokens.bgBase).toEqual(THEME_PALETTES.dark.bgBase);
  });
});

describe("themeBaseOf", () => {
  it("follows the profile base in custom mode", () => {
    const profile = createThemeProfile("light", "#22c55e", "Mine", "p1", 1);

    expect(themeBaseOf("custom", profile)).toBe("light");
    expect(themeBaseOf("custom", null)).toBe("dark");
    expect(themeBaseOf("dark", null)).toBe("dark");
    expect(themeBaseOf("light", null)).toBe("light");
  });
});

describe("applyThemeTokens", () => {
  it("writes finite CSS values for non-finite token numbers", () => {
    const target = fakeElement();
    const tokens = cloneThemeTokens(THEME_PALETTES.dark);
    tokens.textPrimary.alpha = Number.NaN;
    tokens.radiusSmRem = Number.NaN;
    tokens.shadowModal = {
      offsetY: Number.NaN,
      blur: Number.NaN,
      alpha: Number.NaN,
    };

    applyThemeTokens(tokens, "dark", { window: 1, panel: Number.NaN }, target);

    expect(target.style.getPropertyValue("--text-primary")).toBe(
      "rgb(251, 254, 254)",
    );
    expect(target.style.getPropertyValue("--radius-sm")).toBe("0rem");
    expect(target.style.getPropertyValue("--panel-alpha")).toBe("1");
    expect(target.style.getPropertyValue("--shadow-modal")).toBe(
      "0 0px 0px rgba(0, 0, 0, 0.3)",
    );
  });

  it("writes every token property to the target element", () => {
    const target = fakeElement();

    const written = applyThemeTokens(
      cloneThemeTokens(THEME_PALETTES.dark),
      "dark",
      { window: 1, panel: 1 },
      target,
    );

    expect(new Set(written).size).toBe(36);
    expect(target.style.getPropertyValue("--bg-surface-solid")).toBe(
      "rgb(26, 26, 26)",
    );
    expect(target.style.getPropertyValue("--text-primary")).toBe(
      "rgba(251, 254, 254, 0.9)",
    );
    expect(target.style.getPropertyValue("--radius-window")).toBe("7px");
    expect(target.style.getPropertyValue("--container-shadow")).toBe(
      "0 2px 8px rgba(0, 0, 0, 0.3)",
    );
    expect(target.style.getPropertyValue("--shadow-modal")).toBe(
      "0 20px 60px rgba(0, 0, 0, 0.6)",
    );
  });

  it("composes the window opacity into the base background", () => {
    const target = fakeElement();

    applyThemeTokens(
      cloneThemeTokens(THEME_PALETTES.dark),
      "dark",
      { window: 0.5, panel: 0.25 },
      target,
    );

    expect(target.style.getPropertyValue("--bg-base")).toBe(
      "rgba(12, 12, 14, 0.5)",
    );
    expect(target.style.getPropertyValue("--panel-alpha")).toBe("0.25");
  });

  it("derives the accent alphas from the base", () => {
    const target = fakeElement();

    applyThemeTokens(
      cloneThemeTokens(THEME_PALETTES.light),
      "light",
      { window: 1, panel: 1 },
      target,
    );

    expect(target.style.getPropertyValue("--accent-strong")).toBe(
      "rgb(34, 197, 94)",
    );
    expect(target.style.getPropertyValue("--accent-glow-2")).toBe(
      `rgba(34, 197, 94, ${THEME_ACCENT_ALPHAS.light.glow2})`,
    );
  });
});

describe("clearThemeTokens", () => {
  it("removes every property it wrote", () => {
    const target = fakeElement();
    const written = applyThemeTokens(
      cloneThemeTokens(THEME_PALETTES.light),
      "light",
      { window: 1, panel: 1 },
      target,
    );

    clearThemeTokens(target, written);

    for (const name of written) {
      expect(target.style.getPropertyValue(name)).toBe("");
    }
  });
});

describe("sanitizeThemeTokens", () => {
  it("clamps token alphas, radii and shadows", () => {
    const tokens = sanitizeThemeTokens(
      {
        accent: { hex: "#ABCDEF", alpha: 4 },
        border: { hex: "not-a-color", alpha: -2 },
        radiusSmRem: 9,
        radiusMdRem: -1,
        radiusLgRem: 50,
        radiusWindowPx: 100,
        shadowContainer: { offsetY: 500, blur: 900, alpha: 3 },
        shadowModal: null,
      },
      THEME_PALETTES.dark,
    );

    expect(tokens.accent).toEqual({ hex: "#abcdef", alpha: 1 });
    expect(tokens.border.hex).toBe(THEME_PALETTES.dark.border.hex);
    expect(tokens.border.alpha).toBe(0);
    expect(tokens.radiusSmRem).toBe(2);
    expect(tokens.radiusMdRem).toBe(0);
    expect(tokens.radiusLgRem).toBe(3);
    expect(tokens.radiusWindowPx).toBe(32);
    expect(tokens.shadowContainer).toEqual({
      offsetY: 40,
      blur: 96,
      alpha: 1,
    });
    expect(tokens.shadowModal).toBeNull();
  });
});

describe("createThemeProfileFromPreset", () => {
  it("sanitizes the preset tokens", () => {
    const preset = {
      id: "preset",
      name: "Preset",
      base: "dark" as const,
      category: "system" as const,
      tokens: {
        ...cloneThemeTokens(THEME_PALETTES.dark),
        radiusSmRem: 99,
        accent: { hex: "not-a-color", alpha: 5 },
      },
    };

    const profile = createThemeProfileFromPreset(preset, "Preset", "p1", 1);

    expect(profile.tokens.radiusSmRem).toBe(2);
    expect(profile.tokens.accent).toEqual({
      hex: THEME_PALETTES.dark.accent.hex,
      alpha: 1,
    });
  });
});

describe("sanitizeThemeProfiles", () => {
  it("drops profiles that share an id", () => {
    const first = createThemeProfile("dark", "#22c55e", "One", "dup", 1);
    const second = createThemeProfile("light", "#ff0000", "Two", "dup", 2);

    const profiles = sanitizeThemeProfiles([first, second]);

    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe("One");
  });

  it("caps the list at 50 profiles", () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      createThemeProfile("dark", "#22c55e", `Theme ${index}`, `p-${index}`, 1),
    );

    expect(sanitizeThemeProfiles(many)).toHaveLength(MAX_THEME_PROFILES);
  });

  it("always returns a fresh array", () => {
    const source = [createThemeProfile("dark", "#22c55e", "One", "p1", 1)];

    const sanitized = sanitizeThemeProfiles(source);

    expect(sanitized).not.toBe(source);
    expect(sanitizeThemeProfiles([])).not.toBe(sanitizeThemeProfiles([]));
  });

  it("returns an empty list for a value that is not an array", () => {
    expect(sanitizeThemeProfiles("nope")).toEqual([]);
    expect(sanitizeThemeProfiles(null)).toEqual([]);
  });
});
