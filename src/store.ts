import { getVersion } from "@tauri-apps/api/app";
import { LazyStore } from "@tauri-apps/plugin-store";
import {
  BG_IMAGE_SENTINEL,
  clearBgImage,
  loadBgImage,
  saveBgImage,
} from "./utils/bgImageStore";

const store = new LazyStore("settings.json");

export const APP_VERSION = await getVersion();

export type SavedPanel = "simple" | "advanced";
export type ExplanationMode = "off" | "text";
export type Theme = "dark" | "light" | "custom";

export interface CustomThemeColors {
  bgBase: string;
  textPrimary: string;
  accentGreen: string;
  accentYellow: string;
  accentRed: string;
  bgSurface?: string;
  bgElevated?: string;
  bgInput?: string;
  bgInputOff?: string;
  border?: string;
  borderFocus?: string;
  borderSubtle?: string;
  textMuted?: string;
  textDim?: string;
  radiusSm?: string;
  radiusMd?: string;
  radiusLg?: string;
  containerShadow?: string;
  dividerColor?: string;
  statusSuccess?: string;
  statusError?: string;
  kofiStyle?: "1" | "2" | "3" | "4" | "5" | "6";
  backgroundImage?: string;
  backgroundOpacity?: number;
  backgroundBlur?: number;
  panelOpacity?: number;
}

/**
 * Optional string/color fields of CustomThemeColors that are handled
 * generically (no special per-field logic). Keep this list in sync with
 * the CustomThemeColors interface above — it is the single source of truth
 * used by both store sanitization and theme import/export helpers.
 */
export const THEME_OPTIONAL_KEYS = [
  "bgSurface", "bgElevated", "bgInput", "bgInputOff",
  "border", "borderFocus", "borderSubtle",
  "textMuted", "textDim",
  "radiusSm", "radiusMd", "radiusLg",
  "containerShadow", "dividerColor",
  "statusSuccess", "statusError",
] as const satisfies ReadonlyArray<keyof CustomThemeColors>;

export interface Settings {
  version: string;
  clickSpeed: number;
  clickInterval: "s" | "m" | "h" | "d";
  mouseButton: "Left" | "Middle" | "Right";
  hotkey: string;
  mode: "Toggle" | "Hold";
  dutyCycleEnabled: boolean;
  dutyCycle: number;
  speedVariationEnabled: boolean;
  speedVariation: number;
  doubleClickEnabled: boolean;
  doubleClickDelay: number;
  clickLimitEnabled: boolean;
  clickLimit: number;
  timeLimitEnabled: boolean;
  timeLimit: number;
  timeLimitUnit: "s" | "m" | "h";
  cornerStopEnabled: boolean;
  cornerStopTL: number;
  cornerStopTR: number;
  cornerStopBL: number;
  cornerStopBR: number;
  edgeStopEnabled: boolean;
  edgeStopTop: number;
  edgeStopBottom: number;
  edgeStopLeft: number;
  edgeStopRight: number;
  positionEnabled: boolean;
  positionX: number;
  positionY: number;
  disableScreenshots: boolean;
  advancedSettingsEnabled: boolean;
  explanationMode: ExplanationMode;
  lastPanel: SavedPanel;
  showStopReason: boolean;
  showStopOverlay: boolean;
  strictHotkeyModifiers: boolean;
  theme: Theme;
  customTheme: CustomThemeColors;
  customThemeMode: "basic" | "advanced";
}

export interface ClickerStatus {
  running: boolean;
  clickCount: number;
  lastError: string | null;
  stopReason: string | null;
}

export interface AppInfo {
  version: string;
  updateStatus: string;
  screenshotProtectionSupported: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  version: APP_VERSION,
  clickSpeed: 25,
  clickInterval: "s",
  mouseButton: "Left",
  hotkey: "ctrl+y",
  mode: "Toggle",
  dutyCycleEnabled: true,
  dutyCycle: 45,
  speedVariationEnabled: true,
  speedVariation: 35,
  doubleClickEnabled: false,
  doubleClickDelay: 40,
  clickLimitEnabled: false,
  clickLimit: 1000,
  timeLimitEnabled: false,
  timeLimit: 60,
  timeLimitUnit: "s",
  cornerStopEnabled: true,
  cornerStopTL: 50,
  cornerStopTR: 50,
  cornerStopBL: 50,
  cornerStopBR: 50,
  edgeStopEnabled: true,
  edgeStopTop: 40,
  edgeStopBottom: 40,
  edgeStopLeft: 40,
  edgeStopRight: 40,
  positionEnabled: false,
  positionX: 0,
  positionY: 0,
  disableScreenshots: false,
  advancedSettingsEnabled: true,
  explanationMode: "text",
  lastPanel: "simple",
  showStopReason: true,
  showStopOverlay: true,
  strictHotkeyModifiers: false,
  theme: "dark",
  customTheme: {
    bgBase: "#121212",
    textPrimary: "#f9fefe",
    accentGreen: "#19c233bf",
    accentYellow: "#febc2fbf",
    accentRed: "#ff726bbf",
  },
  customThemeMode: "basic",
};

function sanitizeSavedPanel(value: unknown): SavedPanel {
  return value === "advanced" ? value : "simple";
}

function sanitizeExplanationMode(
  input: Partial<Settings> | null | undefined,
): ExplanationMode {
  const saved = (input ?? {}) as Partial<Settings> & {
    functionExplanationsEnabled?: boolean;
    toolTipsEnabled?: boolean;
    explanationMode?: unknown;
  };

  if (saved.explanationMode === "off" || saved.explanationMode === "text") {
    return saved.explanationMode;
  }

  if (saved.toolTipsEnabled) return "text";
  if (saved.functionExplanationsEnabled === false) return "off";
  return "text";
}

function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function clampNumber(
  value: unknown,
  fallback: number,
  min?: number,
  max?: number,
) {
  const parsed =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const minClamped = min === undefined ? parsed : Math.max(min, parsed);
  return max === undefined ? minClamped : Math.min(max, minClamped);
}

function sanitizeSettings(input?: Partial<Settings> | null): Settings {
  const saved = (input ?? {}) as Partial<Settings> & {
    speedVariationMax?: unknown;
    telemetryEnabled?: unknown;
  };
  const legacySpeedVariation = clampNumber(
    saved.speedVariationMax,
    DEFAULT_SETTINGS.speedVariation,
    0,
    200,
  );

  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    version: APP_VERSION,
    clickSpeed: clampNumber(
      saved.clickSpeed,
      DEFAULT_SETTINGS.clickSpeed,
      1,
      500,
    ),
    dutyCycleEnabled: sanitizeBoolean(
      saved.dutyCycleEnabled,
      DEFAULT_SETTINGS.dutyCycleEnabled,
    ),
    speedVariationEnabled: sanitizeBoolean(
      saved.speedVariationEnabled,
      DEFAULT_SETTINGS.speedVariationEnabled,
    ),
    speedVariation: clampNumber(saved.speedVariation, legacySpeedVariation, 0, 200),
    doubleClickDelay: clampNumber(
      saved.doubleClickDelay,
      DEFAULT_SETTINGS.doubleClickDelay,
      20,
      9999,
    ),
    clickLimit: clampNumber(saved.clickLimit, DEFAULT_SETTINGS.clickLimit, 1),
    timeLimit: clampNumber(saved.timeLimit, DEFAULT_SETTINGS.timeLimit, 1),
    cornerStopTL: clampNumber(
      saved.cornerStopTL,
      DEFAULT_SETTINGS.cornerStopTL,
      0,
      999,
    ),
    cornerStopTR: clampNumber(
      saved.cornerStopTR,
      DEFAULT_SETTINGS.cornerStopTR,
      0,
      999,
    ),
    cornerStopBL: clampNumber(
      saved.cornerStopBL,
      DEFAULT_SETTINGS.cornerStopBL,
      0,
      999,
    ),
    cornerStopBR: clampNumber(
      saved.cornerStopBR,
      DEFAULT_SETTINGS.cornerStopBR,
      0,
      999,
    ),
    edgeStopTop: clampNumber(
      saved.edgeStopTop,
      DEFAULT_SETTINGS.edgeStopTop,
      0,
      999,
    ),
    edgeStopBottom: clampNumber(
      saved.edgeStopBottom,
      DEFAULT_SETTINGS.edgeStopBottom,
      0,
      999,
    ),
    edgeStopLeft: clampNumber(
      saved.edgeStopLeft,
      DEFAULT_SETTINGS.edgeStopLeft,
      0,
      999,
    ),
    edgeStopRight: clampNumber(
      saved.edgeStopRight,
      DEFAULT_SETTINGS.edgeStopRight,
      0,
      999,
    ),
    positionX: clampNumber(saved.positionX, DEFAULT_SETTINGS.positionX, 0),
    positionY: clampNumber(saved.positionY, DEFAULT_SETTINGS.positionY, 0),
    disableScreenshots: false,
    explanationMode: sanitizeExplanationMode(saved),
    lastPanel: sanitizeSavedPanel(saved.lastPanel),
    theme: saved.theme === "light" ? "light" : saved.theme === "custom" ? "custom" : "dark",
    customTheme: sanitizeCustomThemeColors(saved.customTheme),
    customThemeMode: saved.customThemeMode === "advanced" ? "advanced" : "basic",
  };
}

function sanitizeCustomThemeColors(input: unknown): CustomThemeColors {
  const c = (typeof input === "object" && input !== null ? input : {}) as Partial<CustomThemeColors>;
  const isHex = (v: unknown) => typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v);
  const isColor = (v: unknown) => typeof v === "string" && v.trim().length > 0;

  const base: CustomThemeColors = {
    bgBase:       isHex(c.bgBase)           ? c.bgBase!           : DEFAULT_SETTINGS.customTheme.bgBase,
    textPrimary:  isColor(c.textPrimary)    ? c.textPrimary!      : DEFAULT_SETTINGS.customTheme.textPrimary,
    accentGreen:  isColor(c.accentGreen)    ? c.accentGreen!      : DEFAULT_SETTINGS.customTheme.accentGreen,
    accentYellow: isColor(c.accentYellow)   ? c.accentYellow!     : DEFAULT_SETTINGS.customTheme.accentYellow,
    accentRed:    isColor(c.accentRed)      ? c.accentRed!        : DEFAULT_SETTINGS.customTheme.accentRed,
  };

  // Optional color fields — include if provided, otherwise CSS fallback is used
  for (const key of THEME_OPTIONAL_KEYS) {
    const val = c[key];
    if (isColor(val)) (base as unknown as Record<string, unknown>)[key] = val;
  }

  if (["1", "2", "3", "4", "5", "6"].includes(c.kofiStyle as string)) {
    base.kofiStyle = c.kofiStyle;
  }
  if (
    typeof c.backgroundImage === "string" &&
    (c.backgroundImage.startsWith("data:image/") || c.backgroundImage === BG_IMAGE_SENTINEL)
  ) {
    base.backgroundImage = c.backgroundImage;
  }
  if (typeof c.backgroundOpacity === "number" && Number.isFinite(c.backgroundOpacity)) {
    base.backgroundOpacity = Math.max(0, Math.min(100, c.backgroundOpacity));
  }
  if (typeof c.backgroundBlur === "number" && Number.isFinite(c.backgroundBlur)) {
    base.backgroundBlur = Math.max(0, Math.min(10, c.backgroundBlur));
  }
  if (typeof c.panelOpacity === "number" && Number.isFinite(c.panelOpacity)) {
    base.panelOpacity = Math.max(0, Math.min(100, c.panelOpacity));
  }

  return base;
}

export async function loadSettings(): Promise<Settings> {
  const saved = await store.get<Partial<Settings>>("settings");
  const settings = sanitizeSettings(saved);
  // Re-hydrate background image from IndexedDB if it was offloaded
  if (settings.customTheme.backgroundImage === BG_IMAGE_SENTINEL) {
    const dataUrl = await loadBgImage();
    if (dataUrl) {
      settings.customTheme.backgroundImage = dataUrl;
    } else {
      delete settings.customTheme.backgroundImage;
    }
  }
  return settings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  const sanitized = sanitizeSettings(settings);
  const bgImage = sanitized.customTheme.backgroundImage;
  let toStore = sanitized;

  if (bgImage?.startsWith("data:")) {
    // Keep settings.json small — store the DataURL in IndexedDB instead
    await saveBgImage(bgImage);
    toStore = {
      ...sanitized,
      customTheme: { ...sanitized.customTheme, backgroundImage: BG_IMAGE_SENTINEL },
    };
  } else if (!bgImage) {
    // Image was removed — clean up IndexedDB entry too
    await clearBgImage().catch(() => { /* non-critical */ });
  }

  await store.set("settings", toStore);
  await store.save();
}

export async function clearSavedSettings(): Promise<void> {
  await clearBgImage().catch(() => { /* non-critical */ });
  await store.set("settings", DEFAULT_SETTINGS);
  await store.save();
}
