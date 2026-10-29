import type { ThemePreset } from "./themePresets";

export type ThemeMode = "dark" | "light" | "custom";
export type ThemeBase = "dark" | "light";

export interface ThemeColor {
  hex: string;
  alpha: number;
}

export interface ThemeShadow {
  offsetY: number;
  blur: number;
  alpha: number;
}

export interface ThemeTokens {
  bgBase: ThemeColor;
  bgSurface: ThemeColor;
  bgElevated: ThemeColor;
  bgInput: ThemeColor;
  bgInputOff: ThemeColor;
  border: ThemeColor;
  borderFocus: ThemeColor;
  borderSubtle: ThemeColor;
  divider: ThemeColor;
  textPrimary: ThemeColor;
  textMuted: ThemeColor;
  textDim: ThemeColor;
  accent: ThemeColor;
  warning: ThemeColor;
  dangerText: ThemeColor;
  danger: ThemeColor;
  statusSuccess: ThemeColor;
  statusError: ThemeColor;
  bannerBg: ThemeColor;
  bannerTitle: ThemeColor;
  bannerButton: ThemeColor;
  scrollbarHover: ThemeColor;
  radiusSmRem: number;
  radiusMdRem: number;
  radiusLgRem: number;
  radiusWindowPx: number;
  shadowContainer: ThemeShadow | null;
  shadowModal: ThemeShadow | null;
}

export interface ThemeProfile {
  id: string;
  name: string;
  base: ThemeBase;
  tokens: ThemeTokens;
  updatedAt: number;
}

export const MAX_THEME_PROFILES = 50;
export const MAX_THEME_PROFILE_NAME = 40;

export type ThemeColorKey = Exclude<
  keyof ThemeTokens,
  | "radiusSmRem"
  | "radiusMdRem"
  | "radiusLgRem"
  | "radiusWindowPx"
  | "shadowContainer"
  | "shadowModal"
>;

export type ThemeGroupId =
  "surfaces" | "text" | "borders" | "accent" | "status" | "banner" | "advanced";

export interface ThemeTokenMeta {
  key: ThemeColorKey;
  label: string;
  group: ThemeGroupId;
  cssVar: string;
}

export const THEME_COLOR_TOKENS: readonly ThemeTokenMeta[] = [
  { key: "bgBase", label: "Window", group: "surfaces", cssVar: "--bg-base" },
  {
    key: "bgSurface",
    label: "Panel",
    group: "surfaces",
    cssVar: "--bg-surface",
  },
  {
    key: "bgElevated",
    label: "Raised",
    group: "surfaces",
    cssVar: "--bg-elevated",
  },
  { key: "bgInput", label: "Input", group: "surfaces", cssVar: "--bg-input" },
  {
    key: "bgInputOff",
    label: "Input off",
    group: "surfaces",
    cssVar: "--bg-input-off",
  },
  { key: "border", label: "Border", group: "borders", cssVar: "--border" },
  {
    key: "borderFocus",
    label: "Border focus",
    group: "borders",
    cssVar: "--border-focus",
  },
  {
    key: "borderSubtle",
    label: "Border subtle",
    group: "borders",
    cssVar: "--border-subtle",
  },
  {
    key: "divider",
    label: "Divider",
    group: "borders",
    cssVar: "--divider-color",
  },
  {
    key: "textPrimary",
    label: "Text",
    group: "text",
    cssVar: "--text-primary",
  },
  {
    key: "textMuted",
    label: "Text muted",
    group: "text",
    cssVar: "--text-muted",
  },
  { key: "textDim", label: "Text dim", group: "text", cssVar: "--text-dim" },
  { key: "accent", label: "Accent", group: "accent", cssVar: "--accent" },
  {
    key: "warning",
    label: "Warning",
    group: "accent",
    cssVar: "--accent-yellow",
  },
  {
    key: "dangerText",
    label: "Danger text",
    group: "accent",
    cssVar: "--accent-red",
  },
  { key: "danger", label: "Danger", group: "status", cssVar: "--danger" },
  {
    key: "statusSuccess",
    label: "Success",
    group: "status",
    cssVar: "--status-success",
  },
  {
    key: "statusError",
    label: "Error",
    group: "status",
    cssVar: "--status-error",
  },
  {
    key: "bannerBg",
    label: "Banner",
    group: "banner",
    cssVar: "--update-banner-bg",
  },
  {
    key: "bannerTitle",
    label: "Banner text",
    group: "banner",
    cssVar: "--update-banner-text-fg",
  },
  {
    key: "bannerButton",
    label: "Banner button",
    group: "banner",
    cssVar: "--update-banner-text-bg",
  },
  {
    key: "scrollbarHover",
    label: "Scrollbar hover",
    group: "advanced",
    cssVar: "--scrollbar-hover",
  },
] as const;

export const THEME_GROUP_LABELS: Record<ThemeGroupId, string> = {
  surfaces: "Surfaces",
  text: "Text",
  borders: "Borders",
  accent: "Accent and warnings",
  status: "Status",
  banner: "Update banner",
  advanced: "Advanced",
};

export interface ThemeAccentAlphas {
  strong: number;
  soft: number;
  ring: number;
  glow1: number;
  glow2: number;
}

export const THEME_ACCENT_ALPHAS: Record<ThemeBase, ThemeAccentAlphas> = {
  dark: { strong: 0.92, soft: 0.4, ring: 0.35, glow1: 0.2, glow2: 0.12 },
  light: { strong: 1, soft: 0.4, ring: 0.4, glow1: 0.16, glow2: 0.08 },
};

export const DEFAULT_ACCENT_HEX = "#22c55e";

function color(hex: string, alpha = 1): ThemeColor {
  return { hex, alpha };
}

function finiteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

const DARK_PALETTE: ThemeTokens = {
  bgBase: color("#0c0c0e"),
  bgSurface: color("#1a1a1a"),
  bgElevated: color("#262626"),
  bgInput: color("#3b3b3b"),
  bgInputOff: color("#333333"),
  border: color("#fbfefe", 0.2),
  borderFocus: color("#fbfefe", 0.3),
  borderSubtle: color("#fbfefe", 0.1),
  divider: color("#ffffff", 0.25),
  textPrimary: color("#fbfefe", 0.9),
  textMuted: color("#fbfefe", 0.75),
  textDim: color("#fbfefe", 0.5),
  accent: color(DEFAULT_ACCENT_HEX, 0.75),
  warning: color("#febc2f", 0.75),
  dangerText: color("#ff756b", 0.75),
  danger: color("#ff756b", 0.95),
  statusSuccess: color("#4ae862"),
  statusError: color("#ff756b"),
  bannerBg: color("#58461d"),
  bannerTitle: color("#ffffff"),
  bannerButton: color("#cccccc"),
  scrollbarHover: color("#777777"),
  radiusSmRem: 0.25,
  radiusMdRem: 0.5,
  radiusLgRem: 1,
  radiusWindowPx: 7,
  shadowContainer: { offsetY: 2, blur: 8, alpha: 0.3 },
  shadowModal: { offsetY: 20, blur: 60, alpha: 0.6 },
};

const LIGHT_PALETTE: ThemeTokens = {
  bgBase: color("#e5dfe7"),
  bgSurface: color("#ffffff"),
  bgElevated: color("#f2f2f2"),
  bgInput: color("#d9d9d9"),
  bgInputOff: color("#d9d9d9"),
  border: color("#666666"),
  borderFocus: color("#595959"),
  borderSubtle: color("#a6a6a6"),
  divider: color("#000000", 0.18),
  textPrimary: color("#000000"),
  textMuted: color("#000000", 0.85),
  textDim: color("#000000", 0.65),
  accent: color(DEFAULT_ACCENT_HEX, 0.9),
  warning: color("#b27a01", 0.9),
  dangerText: color("#e60f00", 0.9),
  danger: color("#e60f00", 0.95),
  statusSuccess: color("#0e6c1c"),
  statusError: color("#b80c00"),
  bannerBg: color("#febc2e", 0.747),
  bannerTitle: color("#000000"),
  bannerButton: color("#262626"),
  scrollbarHover: color("#777777"),
  radiusSmRem: 0.25,
  radiusMdRem: 0.5,
  radiusLgRem: 1,
  radiusWindowPx: 7,
  shadowContainer: null,
  shadowModal: { offsetY: 20, blur: 60, alpha: 0.6 },
};

export const THEME_PALETTES: Record<ThemeBase, ThemeTokens> = {
  dark: DARK_PALETTE,
  light: LIGHT_PALETTE,
};

export function cloneThemeTokens(tokens: ThemeTokens): ThemeTokens {
  const next = { ...tokens } as ThemeTokens;
  for (const meta of THEME_COLOR_TOKENS) {
    next[meta.key] = { ...tokens[meta.key] };
  }
  next.shadowContainer = tokens.shadowContainer
    ? { ...tokens.shadowContainer }
    : null;
  next.shadowModal = tokens.shadowModal ? { ...tokens.shadowModal } : null;
  return next;
}

export function resolveThemeTokens(
  mode: ThemeMode,
  profile: ThemeProfile | null,
  accentColor: string,
): ThemeTokens {
  if (mode === "custom" && profile) {
    return cloneThemeTokens(profile.tokens);
  }
  const base: ThemeBase = mode === "light" ? "light" : "dark";
  const tokens = cloneThemeTokens(THEME_PALETTES[base]);
  tokens.accent = {
    hex: accentColor,
    alpha: THEME_PALETTES[base].accent.alpha,
  };
  return tokens;
}

export function themeBaseOf(
  mode: ThemeMode,
  profile: ThemeProfile | null,
): ThemeBase {
  if (mode === "custom" && profile) return profile.base;
  return mode === "light" ? "light" : "dark";
}

export interface ThemeOpacities {
  window: number;
  panel: number;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHex(hex: string): Rgb {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean.padEnd(6, "0").slice(0, 6);
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

export function themeColorCss(value: ThemeColor): string {
  const { r, g, b } = parseHex(value.hex);
  const alpha = Math.min(Math.max(finiteNumber(value.alpha, 1), 0), 1);
  if (alpha >= 1) {
    return `rgb(${r}, ${g}, ${b})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`;
}

export function themeColorSolid(value: ThemeColor): string {
  const { r, g, b } = parseHex(value.hex);
  return `rgb(${r}, ${g}, ${b})`;
}

export function themeColorComposed(value: ThemeColor, opacity: number): string {
  const { r, g, b } = parseHex(value.hex);
  const alpha = Math.min(
    Math.max(
      finiteNumber(value.alpha, 1) *
        Math.min(Math.max(finiteNumber(opacity, 1), 0), 1),
      0,
    ),
    1,
  );
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`;
}

function shadowCss(shadow: ThemeShadow | null): string {
  if (!shadow) return "none";
  const offsetY = finiteNumber(shadow.offsetY, 0);
  const blur = Math.max(finiteNumber(shadow.blur, 0), 0);
  const alpha = Math.min(Math.max(finiteNumber(shadow.alpha, 0.3), 0), 1);
  return `0 ${offsetY}px ${blur}px rgba(0, 0, 0, ${alpha})`;
}

const COMPOSED_BG_VARS = new Set([
  "--bg-base",
  "--bg-surface",
  "--bg-elevated",
  "--bg-input",
  "--bg-input-off",
]);

export function applyThemeTokens(
  tokens: ThemeTokens,
  base: ThemeBase,
  opacities: ThemeOpacities,
  target: HTMLElement,
): string[] {
  const style = target.style;
  const written: string[] = [];

  const set = (name: string, value: string) => {
    style.setProperty(name, value);
    written.push(name);
  };

  set("--bg-base", themeColorComposed(tokens.bgBase, opacities.window));
  set("--bg-surface", themeColorComposed(tokens.bgSurface, opacities.panel));
  set("--bg-surface-solid", themeColorSolid(tokens.bgSurface));
  set("--bg-elevated", themeColorComposed(tokens.bgElevated, opacities.panel));
  set("--bg-elevated-solid", themeColorSolid(tokens.bgElevated));
  set("--bg-input", themeColorComposed(tokens.bgInput, opacities.panel));
  set("--bg-input-off", themeColorComposed(tokens.bgInputOff, opacities.panel));
  set("--panel-alpha", String(finiteNumber(opacities.panel, 1)));

  for (const meta of THEME_COLOR_TOKENS) {
    if (COMPOSED_BG_VARS.has(meta.cssVar)) continue;
    set(meta.cssVar, themeColorCss(tokens[meta.key]));
  }

  const alphas = THEME_ACCENT_ALPHAS[base];
  const accentHex = tokens.accent.hex;
  set(
    "--accent-strong",
    themeColorCss({ hex: accentHex, alpha: alphas.strong }),
  );
  set("--accent-soft", themeColorCss({ hex: accentHex, alpha: alphas.soft }));
  set("--accent-ring", themeColorCss({ hex: accentHex, alpha: alphas.ring }));
  set(
    "--accent-glow-1",
    themeColorCss({ hex: accentHex, alpha: alphas.glow1 }),
  );
  set(
    "--accent-glow-2",
    themeColorCss({ hex: accentHex, alpha: alphas.glow2 }),
  );

  set("--radius-sm", `${finiteNumber(tokens.radiusSmRem, 0)}rem`);
  set("--radius-md", `${finiteNumber(tokens.radiusMdRem, 0)}rem`);
  set("--radius-lg", `${finiteNumber(tokens.radiusLgRem, 0)}rem`);
  set("--radius-window", `${finiteNumber(tokens.radiusWindowPx, 0)}px`);
  set("--container-shadow", shadowCss(tokens.shadowContainer));
  set("--shadow-modal", shadowCss(tokens.shadowModal));

  return written;
}

export function clearThemeTokens(target: HTMLElement, names: string[]): void {
  for (const name of names) {
    target.style.removeProperty(name);
  }
}

const MAX_ID = 64;

export function normalizeHex(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const raw = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw
      .split("")
      .map((c) => c + c)
      .join("")
      .toLowerCase()}`;
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toLowerCase()}`;
  return fallback;
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(num, min), max);
}

function sanitizeColor(value: unknown, fallback: ThemeColor): ThemeColor {
  const raw = (value ?? {}) as Partial<ThemeColor>;
  return {
    hex: normalizeHex(raw.hex, fallback.hex),
    alpha: clampNumber(raw.alpha, 0, 1, fallback.alpha),
  };
}

function sanitizeShadow(
  value: unknown,
  fallback: ThemeShadow | null,
): ThemeShadow | null {
  if (value === null) return null;
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<ThemeShadow>;
  return {
    offsetY: clampNumber(raw.offsetY, -16, 40, fallback?.offsetY ?? 2),
    blur: clampNumber(raw.blur, 0, 96, fallback?.blur ?? 8),
    alpha: clampNumber(raw.alpha, 0, 1, fallback?.alpha ?? 0.3),
  };
}

export function sanitizeThemeTokens(
  value: unknown,
  fallback: ThemeTokens,
): ThemeTokens {
  const raw = (value ?? {}) as Record<string, unknown>;
  const next = cloneThemeTokens(fallback);
  for (const meta of THEME_COLOR_TOKENS) {
    next[meta.key] = sanitizeColor(raw[meta.key], fallback[meta.key]);
  }
  next.radiusSmRem = clampNumber(raw.radiusSmRem, 0, 2, fallback.radiusSmRem);
  next.radiusMdRem = clampNumber(raw.radiusMdRem, 0, 2.5, fallback.radiusMdRem);
  next.radiusLgRem = clampNumber(raw.radiusLgRem, 0, 3, fallback.radiusLgRem);
  next.radiusWindowPx = clampNumber(
    raw.radiusWindowPx,
    0,
    32,
    fallback.radiusWindowPx,
  );
  next.shadowContainer = sanitizeShadow(
    raw.shadowContainer,
    next.shadowContainer,
  );
  next.shadowModal = sanitizeShadow(raw.shadowModal, next.shadowModal);
  return next;
}

export function createThemeProfile(
  base: ThemeBase,
  accentHex: string,
  name: string,
  id: string,
  now: number,
): ThemeProfile {
  const tokens = cloneThemeTokens(THEME_PALETTES[base]);
  tokens.accent = {
    hex: normalizeHex(accentHex, tokens.accent.hex),
    alpha: tokens.accent.alpha,
  };
  return {
    id,
    name: name.slice(0, MAX_THEME_PROFILE_NAME),
    base,
    tokens,
    updatedAt: now,
  };
}

export function createThemeProfileFromPreset(
  preset: ThemePreset,
  name: string,
  id: string,
  now: number,
): ThemeProfile {
  return {
    id,
    name: name.slice(0, MAX_THEME_PROFILE_NAME),
    base: preset.base,
    tokens: sanitizeThemeTokens(preset.tokens, THEME_PALETTES[preset.base]),
    updatedAt: now,
  };
}

export function nextThemeProfileName(
  profiles: readonly { name: string }[],
): string {
  const used = new Set(profiles.map((p) => p.name.trim()));
  let index = profiles.length + 1;
  for (let i = 1; i <= profiles.length + 2; i += 1) {
    if (!used.has(`Custom ${i}`)) {
      index = i;
      break;
    }
  }
  return `Custom ${index}`;
}

export function sanitizeThemeProfile(value: unknown): ThemeProfile | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || raw.id.length === 0) return null;
  const id = raw.id.slice(0, MAX_ID);
  const base: ThemeBase = raw.base === "light" ? "light" : "dark";
  const name =
    typeof raw.name === "string" && raw.name.trim().length > 0
      ? raw.name.trim().slice(0, MAX_THEME_PROFILE_NAME)
      : "Custom";
  const tokens = sanitizeThemeTokens(raw.tokens, THEME_PALETTES[base]);
  const updatedAt =
    typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
      ? raw.updatedAt
      : 0;
  return {
    id,
    name,
    base,
    tokens,
    updatedAt,
  };
}

export function sanitizeThemeProfiles(value: unknown): ThemeProfile[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: ThemeProfile[] = [];
  for (const entry of value) {
    const profile = sanitizeThemeProfile(entry);
    if (!profile) continue;
    if (seen.has(profile.id)) continue;
    seen.add(profile.id);
    out.push(profile);
    if (out.length >= MAX_THEME_PROFILES) break;
  }
  return out;
}
