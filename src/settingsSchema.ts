import { DEFAULT_LANGUAGE, isLanguage, type Language } from "./i18n";

export type ClickInterval = "s" | "m" | "h" | "d";
export type MouseButton = "Left" | "Middle" | "Right";
export type ClickMode = "Toggle" | "Hold";
export type TimeLimitUnit = "s" | "m" | "h";
export type SavedPanel = "simple" | "advanced";
export type Theme = "dark" | "light";
export type PresetId = string;
export type RateInputMode = "rate" | "duration";

export interface SequencePoint {
  x: number;
  y: number;
}

export interface PresetSnapshot {
  clickSpeed: number;
  clickInterval: ClickInterval;
  mouseButton: MouseButton;
  mode: ClickMode;
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
  timeLimitUnit: TimeLimitUnit;
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
}

export interface PresetDefinition {
  id: PresetId;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: PresetSnapshot;
}

export interface Settings extends PresetSnapshot {
  version: string;
  hotkey: string;
  language: Language;
  rateInputMode: RateInputMode;
  durationMinutes: number;
  durationSeconds: number;
  durationMilliseconds: number;
  sequenceEnabled: boolean;
  sequencePoints: SequencePoint[];
  customStopZoneEnabled: boolean;
  customStopZoneX: number;
  customStopZoneY: number;
  customStopZoneWidth: number;
  customStopZoneHeight: number;
  disableScreenshots: boolean;
  advancedSettingsEnabled: boolean;
  lastPanel: SavedPanel;
  showStopReason: boolean;
  showStopOverlay: boolean;
  strictHotkeyModifiers: boolean;
  minimizeToTray: boolean;
  theme: Theme;
  alwaysOnTop: boolean;
  accentColor: string;
  presets: PresetDefinition[];
  activePresetId: PresetId | null;
  onboardingCompleted: boolean;
}

export const DEFAULT_ACCENT_COLOR = "#22c55e";
export const MAX_PRESETS = 20;
export const PRESET_NAME_MAX_LENGTH = 40;

export const CLICK_INTERVAL_OPTIONS = [
  { value: "s", label: "Second" },
  { value: "m", label: "Minute" },
  { value: "h", label: "Hour" },
  { value: "d", label: "Day" },
] as const satisfies ReadonlyArray<{ value: ClickInterval; label: string }>;

export const MODE_OPTIONS = ["Toggle", "Hold"] as const satisfies ReadonlyArray<ClickMode>;
export const MOUSE_BUTTON_OPTIONS = ["Left", "Middle", "Right"] as const satisfies ReadonlyArray<MouseButton>;
export const TIME_LIMIT_UNIT_OPTIONS = ["s", "m", "h"] as const satisfies ReadonlyArray<TimeLimitUnit>;
export const THEME_OPTIONS = ["dark", "light"] as const satisfies ReadonlyArray<Theme>;

export const SETTINGS_LIMITS = {
  clickSpeed: { min: 1, max: 500 },
  dutyCycle: { min: 0, max: 100 },
  speedVariation: { min: 0, max: 200 },
  doubleClickDelay: { min: 20, max: 9999 },
  clickLimit: { min: 1, max: 10_000_000 },
  timeLimit: { min: 1 },
  stopBoundary: { min: 0, max: 999 },
  position: { min: 0 },
  durationMinutes: { min: 0 },
  durationSeconds: { min: 0, max: 59 },
  durationMilliseconds: { min: 0, max: 999 },
  stopZoneDimension: { min: 1 },
} as const;

export const PRESET_SNAPSHOT_KEYS = [
  "clickSpeed",
  "clickInterval",
  "mouseButton",
  "mode",
  "dutyCycleEnabled",
  "dutyCycle",
  "speedVariationEnabled",
  "speedVariation",
  "doubleClickEnabled",
  "doubleClickDelay",
  "clickLimitEnabled",
  "clickLimit",
  "timeLimitEnabled",
  "timeLimit",
  "timeLimitUnit",
  "cornerStopEnabled",
  "cornerStopTL",
  "cornerStopTR",
  "cornerStopBL",
  "cornerStopBR",
  "edgeStopEnabled",
  "edgeStopTop",
  "edgeStopBottom",
  "edgeStopLeft",
  "edgeStopRight",
  "positionEnabled",
  "positionX",
  "positionY",
] as const satisfies ReadonlyArray<keyof PresetSnapshot>;

export function clampNumber(
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

export function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeSavedPanel(value: unknown): SavedPanel {
  return value === "advanced" ? value : "simple";
}

function sanitizeTheme(value: unknown): Theme {
  return value === "light" ? "light" : "dark";
}

export function sanitizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback;
}

export function sanitizePresetName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, PRESET_NAME_MAX_LENGTH);
}

function createFallbackPresetId(index: number) {
  return `preset-${index + 1}`;
}

export function createDefaultSettings(version: string): Settings {
  return {
    version,
    clickSpeed: 25,
    clickInterval: "s",
    mouseButton: "Left",
    hotkey: "ctrl+y",
    language: DEFAULT_LANGUAGE,
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
    rateInputMode: "rate",
    durationMinutes: 0,
    durationSeconds: 0,
    durationMilliseconds: 40,
    sequenceEnabled: false,
    sequencePoints: [],
    customStopZoneEnabled: false,
    customStopZoneX: 0,
    customStopZoneY: 0,
    customStopZoneWidth: 100,
    customStopZoneHeight: 100,
    disableScreenshots: false,
    advancedSettingsEnabled: true,
    lastPanel: "simple",
    showStopReason: true,
    showStopOverlay: true,
    strictHotkeyModifiers: false,
    minimizeToTray: false,
    theme: "dark",
    alwaysOnTop: false,
    accentColor: DEFAULT_ACCENT_COLOR,
    presets: [],
    activePresetId: null,
    onboardingCompleted: false,
  };
}

export function buildPresetSnapshot(settings: Settings): PresetSnapshot {
  return {
    clickSpeed: settings.clickSpeed,
    clickInterval: settings.clickInterval,
    mouseButton: settings.mouseButton,
    mode: settings.mode,
    dutyCycleEnabled: settings.dutyCycleEnabled,
    dutyCycle: settings.dutyCycle,
    speedVariationEnabled: settings.speedVariationEnabled,
    speedVariation: settings.speedVariation,
    doubleClickEnabled: settings.doubleClickEnabled,
    doubleClickDelay: settings.doubleClickDelay,
    clickLimitEnabled: settings.clickLimitEnabled,
    clickLimit: settings.clickLimit,
    timeLimitEnabled: settings.timeLimitEnabled,
    timeLimit: settings.timeLimit,
    timeLimitUnit: settings.timeLimitUnit,
    cornerStopEnabled: settings.cornerStopEnabled,
    cornerStopTL: settings.cornerStopTL,
    cornerStopTR: settings.cornerStopTR,
    cornerStopBL: settings.cornerStopBL,
    cornerStopBR: settings.cornerStopBR,
    edgeStopEnabled: settings.edgeStopEnabled,
    edgeStopTop: settings.edgeStopTop,
    edgeStopBottom: settings.edgeStopBottom,
    edgeStopLeft: settings.edgeStopLeft,
    edgeStopRight: settings.edgeStopRight,
    positionEnabled: settings.positionEnabled,
    positionX: settings.positionX,
    positionY: settings.positionY,
  };
}

export function applyPresetSnapshot(
  base: Settings,
  snapshot: PresetSnapshot,
): Settings {
  return {
    ...base,
    ...snapshot,
  };
}

export function createPresetDefinition(
  name: string,
  settings: Settings,
): PresetDefinition {
  const now = new Date().toISOString();
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    name: sanitizePresetName(name),
    createdAt: now,
    updatedAt: now,
    settings: buildPresetSnapshot(settings),
  };
}

function sanitizePresetSnapshot(
  input: unknown,
  defaults: PresetSnapshot,
): PresetSnapshot {
  const saved = (input ?? {}) as Partial<PresetSnapshot>;

  return {
    ...defaults,
    clickSpeed: clampNumber(
      saved.clickSpeed,
      defaults.clickSpeed,
      SETTINGS_LIMITS.clickSpeed.min,
      SETTINGS_LIMITS.clickSpeed.max,
    ),
    clickInterval:
      saved.clickInterval === "m" ||
      saved.clickInterval === "h" ||
      saved.clickInterval === "d"
        ? saved.clickInterval
        : defaults.clickInterval,
    mouseButton:
      saved.mouseButton === "Middle" || saved.mouseButton === "Right"
        ? saved.mouseButton
        : defaults.mouseButton,
    mode: saved.mode === "Hold" ? "Hold" : defaults.mode,
    dutyCycleEnabled: sanitizeBoolean(
      saved.dutyCycleEnabled,
      defaults.dutyCycleEnabled,
    ),
    dutyCycle: clampNumber(
      saved.dutyCycle,
      defaults.dutyCycle,
      SETTINGS_LIMITS.dutyCycle.min,
      SETTINGS_LIMITS.dutyCycle.max,
    ),
    speedVariationEnabled: sanitizeBoolean(
      saved.speedVariationEnabled,
      defaults.speedVariationEnabled,
    ),
    speedVariation: clampNumber(
      saved.speedVariation,
      defaults.speedVariation,
      SETTINGS_LIMITS.speedVariation.min,
      SETTINGS_LIMITS.speedVariation.max,
    ),
    doubleClickEnabled: sanitizeBoolean(
      saved.doubleClickEnabled,
      defaults.doubleClickEnabled,
    ),
    doubleClickDelay: clampNumber(
      saved.doubleClickDelay,
      defaults.doubleClickDelay,
      SETTINGS_LIMITS.doubleClickDelay.min,
      SETTINGS_LIMITS.doubleClickDelay.max,
    ),
    clickLimitEnabled: sanitizeBoolean(
      saved.clickLimitEnabled,
      defaults.clickLimitEnabled,
    ),
    clickLimit: clampNumber(
      saved.clickLimit,
      defaults.clickLimit,
      SETTINGS_LIMITS.clickLimit.min,
      SETTINGS_LIMITS.clickLimit.max,
    ),
    timeLimitEnabled: sanitizeBoolean(
      saved.timeLimitEnabled,
      defaults.timeLimitEnabled,
    ),
    timeLimit: clampNumber(
      saved.timeLimit,
      defaults.timeLimit,
      SETTINGS_LIMITS.timeLimit.min,
    ),
    timeLimitUnit:
      saved.timeLimitUnit === "m" || saved.timeLimitUnit === "h"
        ? saved.timeLimitUnit
        : defaults.timeLimitUnit,
    cornerStopEnabled: sanitizeBoolean(
      saved.cornerStopEnabled,
      defaults.cornerStopEnabled,
    ),
    cornerStopTL: clampNumber(
      saved.cornerStopTL,
      defaults.cornerStopTL,
      SETTINGS_LIMITS.stopBoundary.min,
      SETTINGS_LIMITS.stopBoundary.max,
    ),
    cornerStopTR: clampNumber(
      saved.cornerStopTR,
      defaults.cornerStopTR,
      SETTINGS_LIMITS.stopBoundary.min,
      SETTINGS_LIMITS.stopBoundary.max,
    ),
    cornerStopBL: clampNumber(
      saved.cornerStopBL,
      defaults.cornerStopBL,
      SETTINGS_LIMITS.stopBoundary.min,
      SETTINGS_LIMITS.stopBoundary.max,
    ),
    cornerStopBR: clampNumber(
      saved.cornerStopBR,
      defaults.cornerStopBR,
      SETTINGS_LIMITS.stopBoundary.min,
      SETTINGS_LIMITS.stopBoundary.max,
    ),
    edgeStopEnabled: sanitizeBoolean(
      saved.edgeStopEnabled,
      defaults.edgeStopEnabled,
    ),
    edgeStopTop: clampNumber(
      saved.edgeStopTop,
      defaults.edgeStopTop,
      SETTINGS_LIMITS.stopBoundary.min,
      SETTINGS_LIMITS.stopBoundary.max,
    ),
    edgeStopBottom: clampNumber(
      saved.edgeStopBottom,
      defaults.edgeStopBottom,
      SETTINGS_LIMITS.stopBoundary.min,
      SETTINGS_LIMITS.stopBoundary.max,
    ),
    edgeStopLeft: clampNumber(
      saved.edgeStopLeft,
      defaults.edgeStopLeft,
      SETTINGS_LIMITS.stopBoundary.min,
      SETTINGS_LIMITS.stopBoundary.max,
    ),
    edgeStopRight: clampNumber(
      saved.edgeStopRight,
      defaults.edgeStopRight,
      SETTINGS_LIMITS.stopBoundary.min,
      SETTINGS_LIMITS.stopBoundary.max,
    ),
    positionEnabled: sanitizeBoolean(
      saved.positionEnabled,
      defaults.positionEnabled,
    ),
    positionX: clampNumber(
      saved.positionX,
      defaults.positionX,
      SETTINGS_LIMITS.position.min,
    ),
    positionY: clampNumber(
      saved.positionY,
      defaults.positionY,
      SETTINGS_LIMITS.position.min,
    ),
  };
}

function sanitizeRateInputMode(value: unknown): RateInputMode {
  return value === "duration" ? "duration" : "rate";
}

function sanitizeSequencePoints(value: unknown): SequencePoint[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((point) => {
      if (!point || typeof point !== "object") return null;
      const candidate = point as Partial<SequencePoint>;
      const x = typeof candidate.x === "number" && Number.isFinite(candidate.x) ? Math.trunc(candidate.x) : null;
      const y = typeof candidate.y === "number" && Number.isFinite(candidate.y) ? Math.trunc(candidate.y) : null;
      if (x === null || y === null) return null;
      return { x, y };
    })
    .filter((point): point is SequencePoint => point !== null);
}

function sanitizePresets(input: unknown, defaults: Settings): PresetDefinition[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const defaultSnapshot = buildPresetSnapshot(defaults);

  return input
    .slice(0, MAX_PRESETS)
    .map((preset, index) => {
      if (!preset || typeof preset !== "object") {
        return null;
      }

      const saved = preset as Partial<PresetDefinition>;
      const name = sanitizePresetName(saved.name);
      if (!name) {
        return null;
      }

      const now = new Date().toISOString();

      return {
        id:
          typeof saved.id === "string" && saved.id.trim()
            ? saved.id.trim()
            : createFallbackPresetId(index),
        name,
        createdAt:
          typeof saved.createdAt === "string" && saved.createdAt
            ? saved.createdAt
            : now,
        updatedAt:
          typeof saved.updatedAt === "string" && saved.updatedAt
            ? saved.updatedAt
            : now,
        settings: sanitizePresetSnapshot(saved.settings, defaultSnapshot),
      } satisfies PresetDefinition;
    })
    .filter((preset): preset is PresetDefinition => preset !== null);
}

export function sanitizeSettings(
  input: Partial<Settings> | null | undefined,
  version: string,
): Settings {
  const defaults = createDefaultSettings(version);
  const saved = (input ?? {}) as Partial<Settings> & {
    speedVariationMax?: unknown;
    telemetryEnabled?: unknown;
  };
  const legacySpeedVariation = clampNumber(
    saved.speedVariationMax,
    defaults.speedVariation,
    SETTINGS_LIMITS.speedVariation.min,
    SETTINGS_LIMITS.speedVariation.max,
  );
  const presets = sanitizePresets(saved.presets, defaults);
  const sequenceEnabled = sanitizeBoolean(saved.sequenceEnabled, defaults.sequenceEnabled);

  return {
    ...defaults,
    ...saved,
    version,
    language: isLanguage(saved.language) ? saved.language : defaults.language,
    clickSpeed: clampNumber(
      saved.clickSpeed,
      defaults.clickSpeed,
      SETTINGS_LIMITS.clickSpeed.min,
      SETTINGS_LIMITS.clickSpeed.max,
    ),
    dutyCycleEnabled: sanitizeBoolean(
      saved.dutyCycleEnabled,
      defaults.dutyCycleEnabled,
    ),
    dutyCycle: clampNumber(
      saved.dutyCycle,
      defaults.dutyCycle,
      SETTINGS_LIMITS.dutyCycle.min,
      SETTINGS_LIMITS.dutyCycle.max,
    ),
    speedVariationEnabled: sanitizeBoolean(
      saved.speedVariationEnabled,
      defaults.speedVariationEnabled,
    ),
    speedVariation: clampNumber(
      saved.speedVariation,
      legacySpeedVariation,
      SETTINGS_LIMITS.speedVariation.min,
      SETTINGS_LIMITS.speedVariation.max,
    ),
    doubleClickEnabled: sanitizeBoolean(
      saved.doubleClickEnabled,
      defaults.doubleClickEnabled,
    ),
    doubleClickDelay: clampNumber(
      saved.doubleClickDelay,
      defaults.doubleClickDelay,
      SETTINGS_LIMITS.doubleClickDelay.min,
      SETTINGS_LIMITS.doubleClickDelay.max,
    ),
    clickLimitEnabled: sanitizeBoolean(
      saved.clickLimitEnabled,
      defaults.clickLimitEnabled,
    ),
    clickLimit: clampNumber(
      saved.clickLimit,
      defaults.clickLimit,
      SETTINGS_LIMITS.clickLimit.min,
      SETTINGS_LIMITS.clickLimit.max,
    ),
    timeLimitEnabled: sanitizeBoolean(
      saved.timeLimitEnabled,
      defaults.timeLimitEnabled,
    ),
    timeLimit: clampNumber(
      saved.timeLimit,
      defaults.timeLimit,
      SETTINGS_LIMITS.timeLimit.min,
    ),
    cornerStopEnabled: sanitizeBoolean(
      saved.cornerStopEnabled,
      defaults.cornerStopEnabled,
    ),
    cornerStopTL: clampNumber(
      saved.cornerStopTL,
      defaults.cornerStopTL,
      SETTINGS_LIMITS.stopBoundary.min,
      SETTINGS_LIMITS.stopBoundary.max,
    ),
    cornerStopTR: clampNumber(
      saved.cornerStopTR,
      defaults.cornerStopTR,
      SETTINGS_LIMITS.stopBoundary.min,
      SETTINGS_LIMITS.stopBoundary.max,
    ),
    cornerStopBL: clampNumber(
      saved.cornerStopBL,
      defaults.cornerStopBL,
      SETTINGS_LIMITS.stopBoundary.min,
      SETTINGS_LIMITS.stopBoundary.max,
    ),
    cornerStopBR: clampNumber(
      saved.cornerStopBR,
      defaults.cornerStopBR,
      SETTINGS_LIMITS.stopBoundary.min,
      SETTINGS_LIMITS.stopBoundary.max,
    ),
    edgeStopEnabled: sanitizeBoolean(
      saved.edgeStopEnabled,
      defaults.edgeStopEnabled,
    ),
    edgeStopTop: clampNumber(
      saved.edgeStopTop,
      defaults.edgeStopTop,
      SETTINGS_LIMITS.stopBoundary.min,
      SETTINGS_LIMITS.stopBoundary.max,
    ),
    edgeStopBottom: clampNumber(
      saved.edgeStopBottom,
      defaults.edgeStopBottom,
      SETTINGS_LIMITS.stopBoundary.min,
      SETTINGS_LIMITS.stopBoundary.max,
    ),
    edgeStopLeft: clampNumber(
      saved.edgeStopLeft,
      defaults.edgeStopLeft,
      SETTINGS_LIMITS.stopBoundary.min,
      SETTINGS_LIMITS.stopBoundary.max,
    ),
    edgeStopRight: clampNumber(
      saved.edgeStopRight,
      defaults.edgeStopRight,
      SETTINGS_LIMITS.stopBoundary.min,
      SETTINGS_LIMITS.stopBoundary.max,
    ),
    positionEnabled: sequenceEnabled ? false : sanitizeBoolean(saved.positionEnabled, defaults.positionEnabled),
    positionX: clampNumber(
      saved.positionX,
      defaults.positionX,
      SETTINGS_LIMITS.position.min,
    ),
    positionY: clampNumber(
      saved.positionY,
      defaults.positionY,
      SETTINGS_LIMITS.position.min,
    ),
    rateInputMode: sanitizeRateInputMode(saved.rateInputMode),
    durationMinutes: clampNumber(saved.durationMinutes, defaults.durationMinutes, SETTINGS_LIMITS.durationMinutes.min),
    durationSeconds: clampNumber(saved.durationSeconds, defaults.durationSeconds, SETTINGS_LIMITS.durationSeconds.min, SETTINGS_LIMITS.durationSeconds.max),
    durationMilliseconds: clampNumber(saved.durationMilliseconds, defaults.durationMilliseconds, SETTINGS_LIMITS.durationMilliseconds.min, SETTINGS_LIMITS.durationMilliseconds.max),
    sequenceEnabled,
    sequencePoints: sanitizeSequencePoints(saved.sequencePoints),
    customStopZoneEnabled: sanitizeBoolean(saved.customStopZoneEnabled, defaults.customStopZoneEnabled),
    customStopZoneX: clampNumber(saved.customStopZoneX, defaults.customStopZoneX),
    customStopZoneY: clampNumber(saved.customStopZoneY, defaults.customStopZoneY),
    customStopZoneWidth: clampNumber(saved.customStopZoneWidth, defaults.customStopZoneWidth, SETTINGS_LIMITS.stopZoneDimension.min),
    customStopZoneHeight: clampNumber(saved.customStopZoneHeight, defaults.customStopZoneHeight, SETTINGS_LIMITS.stopZoneDimension.min),
    disableScreenshots: false,
    lastPanel: sanitizeSavedPanel(saved.lastPanel),
    theme: sanitizeTheme(saved.theme),
    strictHotkeyModifiers: sanitizeBoolean(saved.strictHotkeyModifiers, defaults.strictHotkeyModifiers),
    minimizeToTray: sanitizeBoolean(saved.minimizeToTray, defaults.minimizeToTray),
    alwaysOnTop: sanitizeBoolean(saved.alwaysOnTop, defaults.alwaysOnTop),
    accentColor: sanitizeHexColor(saved.accentColor, defaults.accentColor),
    presets,
    activePresetId:
      typeof saved.activePresetId === "string" &&
      presets.some((preset) => preset.id === saved.activePresetId)
        ? saved.activePresetId
        : null,
    onboardingCompleted: sanitizeBoolean(
      saved.onboardingCompleted,
      defaults.onboardingCompleted,
    ),
  };
}
