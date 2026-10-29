import { MAX_THEME_PROFILE_NAME } from "../../themeModel";

export const PROFILE_NAME_MAX_LENGTH = MAX_THEME_PROFILE_NAME;

export type ThemeRadiusKey =
  "radiusSmRem" | "radiusMdRem" | "radiusLgRem" | "radiusWindowPx";

export type ThemeShadowKey = "shadowContainer" | "shadowModal";

export function newThemeProfileId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `theme-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function themeValueEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
