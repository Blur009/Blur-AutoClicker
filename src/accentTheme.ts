import type { Theme } from "./settingsSchema";

type RGB = {
  r: number;
  g: number;
  b: number;
};

function hexToRgb(hex: string): RGB {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);

  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

function rgba({ r, g, b }: RGB, alpha: number) {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function applyAccentTheme(accentColor: string, theme: Theme) {
  const root = document.documentElement;
  const rgb = hexToRgb(accentColor);
  const accentAlpha = theme === "light" ? 0.9 : 0.75;
  const strongAlpha = theme === "light" ? 1 : 0.92;
  const softAlpha = theme === "light" ? 0.2 : 0.15;
  const ringAlpha = theme === "light" ? 0.4 : 0.35;
  const glowPrimaryAlpha = theme === "light" ? 0.16 : 0.2;
  const glowSecondaryAlpha = theme === "light" ? 0.08 : 0.12;

  root.style.setProperty("--accent-green", rgba(rgb, accentAlpha));
  root.style.setProperty("--accent-green-strong", rgba(rgb, strongAlpha));
  root.style.setProperty("--accent-green-soft", rgba(rgb, softAlpha));
  root.style.setProperty("--accent-green-ring", rgba(rgb, ringAlpha));
  root.style.setProperty("--accent-green-glow-1", rgba(rgb, glowPrimaryAlpha));
  root.style.setProperty("--accent-green-glow-2", rgba(rgb, glowSecondaryAlpha));
}
