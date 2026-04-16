import { getVersion } from "@tauri-apps/api/app";
import { LazyStore } from "@tauri-apps/plugin-store";

const store = new LazyStore("settings.json");

export const APP_VERSION = await getVersion();

export type SavedPanel = "simple" | "advanced";
export type ExplanationMode = "off" | "text";
export type Theme = "dark" | "light";

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
  theme: Theme;
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
  theme: "dark",
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
    theme: saved.theme === "light" ? "light" : "dark",
  };
}

export async function loadSettings(): Promise<Settings> {
  const saved = await store.get<Partial<Settings>>("settings");
  return sanitizeSettings(saved);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await store.set("settings", sanitizeSettings(settings));
  await store.save();
}

export async function clearSavedSettings(): Promise<void> {
  await store.set("settings", DEFAULT_SETTINGS);
  await store.save();
}
