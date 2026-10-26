import {
  themeColorCss,
  THEME_ACCENT_ALPHAS,
  THEME_PALETTES,
  type ThemeBase,
} from "./themeModel";

export function applyAccentTheme(
  accentColor: string,
  base: ThemeBase,
  target: HTMLElement = document.documentElement,
): void {
  const alphas = THEME_ACCENT_ALPHAS[base];
  const derived: Array<[string, number]> = [
    ["--accent", THEME_PALETTES[base].accent.alpha],
    ["--accent-strong", alphas.strong],
    ["--accent-soft", alphas.soft],
    ["--accent-ring", alphas.ring],
    ["--accent-glow-1", alphas.glow1],
    ["--accent-glow-2", alphas.glow2],
  ];

  for (const [name, alpha] of derived) {
    target.style.setProperty(name, themeColorCss({ hex: accentColor, alpha }));
  }
}
