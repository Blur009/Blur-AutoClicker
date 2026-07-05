export type ClickInterval = "s" | "m" | "h" | "d";
export type MouseButton = "Left" | "Middle" | "Right";
export type InputType = "mouse" | "keyboard";
export type KeyboardKeyCase = "lower" | "upper";
export type ClickMode = "Toggle" | "Hold";
export type TimeLimitUnit = "s" | "m" | "h";
export type SavedPanel = "simple" | "advanced" | "zones" | "sequence";
export type Theme = "dark" | "light";
export type PresetId = string;
export type RateInputMode = "rate" | "duration";
export type ProcessListMode = "whitelist" | "blacklist";
export type ProcessListBehavior = "pause" | "stop";

export interface ProcessListEntry {
  name: string;
  behavior: ProcessListBehavior;
  enabled: boolean;
}
export type AdvancedSequenceLayout = "wide" | "tall";

export interface SequencePoint {
  id: string;
  x: number;
  y: number;
  clicks: number;
}

export const DEFAULT_ACCENT_COLOR = "#22c55e";
export const MAX_PRESETS = 20;
export const PRESET_NAME_MAX_LENGTH = 40;
export const DEFAULT_MAX_CLICK_SPEED = 500;
export const EXTENDED_MAX_CLICK_SPEED = 1000;

export const CLICK_INTERVAL_OPTIONS = [
  { value: "s", label: "Second" },
  { value: "m", label: "Minute" },
  { value: "h", label: "Hour" },
  { value: "d", label: "Day" },
] as const satisfies ReadonlyArray<{ value: ClickInterval; label: string }>;

export const MODE_OPTIONS = [
  "Toggle",
  "Hold",
] as const satisfies ReadonlyArray<ClickMode>;
export const MOUSE_BUTTON_OPTIONS = [
  "Left",
  "Middle",
  "Right",
] as const satisfies ReadonlyArray<MouseButton>;
export const TIME_LIMIT_UNIT_OPTIONS = [
  "s",
  "m",
  "h",
] as const satisfies ReadonlyArray<TimeLimitUnit>;
export const THEME_OPTIONS = [
  "dark",
  "light",
] as const satisfies ReadonlyArray<Theme>;

type LimitDef = {
  min?: number;
  max?: number;
};

type UiControl =
  | "toggle"
  | "select"
  | "number"
  | "color"
  | "text"
  | "hotkey"
  | "key"
  | "custom";

type FieldDef<T> = {
  default: T;
  limit?: LimitDef;
  ui?: {
    section:
      | "core"
      | "limits"
      | "failsafe"
      | "behavior"
      | "startup"
      | "appearance"
      | "presets";
    control: UiControl;
  };
};

function createSequencePointId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `seq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

//Houses all options that get saved when making presets in the settings pannel
const PRESET_FIELDS = {
  clickSpeed: {
    default: 25,
    limit: { min: 1, max: EXTENDED_MAX_CLICK_SPEED },
    ui: { section: "core", control: "number" },
  },
  clickInterval: {
    default: "s" as ClickInterval,
    ui: { section: "core", control: "select" },
  },
  inputType: {
    default: "mouse" as InputType,
    ui: { section: "core", control: "select" },
  },
  keyboardKey: {
    default: "",
    ui: { section: "core", control: "key" },
  },
  keyboardKeyCase: {
    default: "lower" as KeyboardKeyCase,
    ui: { section: "core", control: "toggle" },
  },
  mouseButton: {
    default: "Left" as MouseButton,
    ui: { section: "core", control: "select" },
  },
  mode: {
    default: "Toggle" as ClickMode,
    ui: { section: "core", control: "select" },
  },
  dutyCycleEnabled: {
    default: true,
    ui: { section: "limits", control: "toggle" },
  },
  dutyCycle: {
    default: 45,
    limit: { min: 0, max: 100 },
    ui: { section: "limits", control: "number" },
  },
  speedVariationEnabled: {
    default: true,
    ui: { section: "limits", control: "toggle" },
  },
  speedVariation: {
    default: 35,
    limit: { min: 0, max: 200 },
    ui: { section: "limits", control: "number" },
  },
  doubleClickEnabled: {
    default: false,
    ui: { section: "limits", control: "toggle" },
  },
  clickLimitEnabled: {
    default: false,
    ui: { section: "limits", control: "toggle" },
  },
  clickLimit: {
    default: 1000,
    limit: { min: 1, max: 10_000_000 },
    ui: { section: "limits", control: "number" },
  },
  timeLimitEnabled: {
    default: false,
    ui: { section: "limits", control: "toggle" },
  },
  timeLimit: {
    default: 60,
    limit: { min: 1 },
    ui: { section: "limits", control: "number" },
  },
  timeLimitUnit: {
    default: "s" as TimeLimitUnit,
    ui: { section: "limits", control: "select" },
  },
  cornerStopEnabled: {
    default: true,
    ui: { section: "failsafe", control: "toggle" },
  },
  cornerStopTL: {
    default: 50,
    limit: { min: 0, max: 10000 },
    ui: { section: "failsafe", control: "number" },
  },
  cornerStopTR: {
    default: 50,
    limit: { min: 0, max: 10000 },
    ui: { section: "failsafe", control: "number" },
  },
  cornerStopBL: {
    default: 50,
    limit: { min: 0, max: 10000 },
    ui: { section: "failsafe", control: "number" },
  },
  cornerStopBR: {
    default: 50,
    limit: { min: 0, max: 10000 },
    ui: { section: "failsafe", control: "number" },
  },
  edgeStopEnabled: {
    default: true,
    ui: { section: "failsafe", control: "toggle" },
  },
  edgeStopTop: {
    default: 40,
    limit: { min: 0, max: 10000 },
    ui: { section: "failsafe", control: "number" },
  },
  edgeStopBottom: {
    default: 40,
    limit: { min: 0, max: 10000 },
    ui: { section: "failsafe", control: "number" },
  },
  edgeStopLeft: {
    default: 40,
    limit: { min: 0, max: 10000 },
    ui: { section: "failsafe", control: "number" },
  },
  edgeStopRight: {
    default: 40,
    limit: { min: 0, max: 10000 },
    ui: { section: "failsafe", control: "number" },
  },
  sequenceEnabled: {
    default: false,
    ui: { section: "core", control: "toggle" },
  },
  sequencePoints: {
    default: [] as SequencePoint[],
    ui: { section: "core", control: "custom" },
  },
  processListEnabled: {
    default: false,
    ui: { section: "failsafe", control: "toggle" },
  },
  processListMode: {
    default: "whitelist" as ProcessListMode,
    ui: { section: "failsafe", control: "select" },
  },
  processListEntries: {
    default: [] as ProcessListEntry[],
    ui: { section: "failsafe", control: "custom" },
  },
} satisfies Record<string, FieldDef<unknown>>;

//All Other settings that do not need to be saved by presets go here.
const SETTINGS_ONLY_FIELDS = {
  hotkey: {
    default: "ctrl+y",
    ui: { section: "core", control: "hotkey" },
  },
  rateInputMode: {
    default: "rate" as RateInputMode,
    ui: { section: "core", control: "select" },
  },
  durationHours: {
    default: 0,
    limit: { min: 0, max: 999 },
    ui: { section: "limits", control: "number" },
  },
  durationMinutes: {
    default: 0,
    limit: { min: 0 },
    ui: { section: "limits", control: "number" },
  },
  durationSeconds: {
    default: 0,
    limit: { min: 0, max: 59 },
    ui: { section: "limits", control: "number" },
  },
  durationMilliseconds: {
    default: 40,
    limit: { min: 0, max: 999 },
    ui: { section: "limits", control: "number" },
  },
  customStopZoneEnabled: {
    default: false,
    ui: { section: "failsafe", control: "toggle" },
  },
  customStopZoneX: {
    default: 0,
    limit: { min: 0 },
    ui: { section: "failsafe", control: "number" },
  },
  customStopZoneY: {
    default: 0,
    limit: { min: 0 },
    ui: { section: "failsafe", control: "number" },
  },
  customStopZoneWidth: {
    default: 100,
    limit: { min: 1 },
    ui: { section: "failsafe", control: "number" },
  },
  customStopZoneHeight: {
    default: 100,
    limit: { min: 1 },
    ui: { section: "failsafe", control: "number" },
  },
  disableScreenshots: {
    default: false,
    ui: { section: "behavior", control: "toggle" },
  },
  advancedSettingsEnabled: {
    default: true,
    ui: { section: "behavior", control: "toggle" },
  },
  lastPanel: {
    default: "simple" as SavedPanel,
    ui: { section: "behavior", control: "select" },
  },
  showStopReason: {
    default: true,
    ui: { section: "behavior", control: "toggle" },
  },
  showStopOverlay: {
    default: true,
    ui: { section: "behavior", control: "toggle" },
  },
  strictHotkeyModifiers: {
    default: false,
    ui: { section: "behavior", control: "toggle" },
  },
  taskSwitcherStopEnabled: {
    default: true,
    ui: { section: "behavior", control: "toggle" },
  },
  extendedClickSpeedLimit: {
    default: false,
    ui: { section: "behavior", control: "toggle" },
  },
  minimizeToTray: {
    default: false,
    ui: { section: "startup", control: "toggle" },
  },
  theme: {
    default: "dark" as Theme,
    ui: { section: "appearance", control: "select" },
  },
  advancedSequenceLayout: {
    default: "wide" as AdvancedSequenceLayout,
    ui: { section: "appearance", control: "select" },
  },
  alwaysOnTop: {
    default: false,
    ui: { section: "behavior", control: "toggle" },
  },
  accentColor: {
    default: DEFAULT_ACCENT_COLOR,
    ui: { section: "appearance", control: "color" },
  },
  backgroundImage: {
    default: "",
    ui: { section: "appearance", control: "custom" },
  },
  backgroundOpacity: {
    default: 100,
    limit: { min: 0, max: 100 },
    ui: { section: "appearance", control: "number" },
  },
  panelOpacity: {
    default: 100,
    limit: { min: 0, max: 100 },
    ui: { section: "appearance", control: "number" },
  },
  panelBlur: {
    default: 0,
    limit: { min: 0, max: 20 },
    ui: { section: "appearance", control: "number" },
  },
  presets: {
    default: [] as PresetDefinition[],
    ui: { section: "presets", control: "custom" },
  },
  activePresetId: {
    default: null as PresetId | null,
    ui: { section: "presets", control: "custom" },
  },
} satisfies Record<string, FieldDef<unknown>>;

export const SETTINGS_FIELD_DEFS = {
  ...PRESET_FIELDS,
  ...SETTINGS_ONLY_FIELDS,
};

type DefaultValues<F extends Record<string, FieldDef<unknown>>> = {
  [K in keyof F]: F[K]["default"];
};

function defaultsFromFields<F extends Record<string, FieldDef<unknown>>>(
  fields: F,
): DefaultValues<F> {
  const output: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(fields)) {
    output[key] = def.default;
  }
  return output as DefaultValues<F>;
}

type LimitKeys<F extends Record<string, FieldDef<unknown>>> = {
  [K in keyof F]: Exclude<F[K]["limit"], undefined> extends never ? never : K;
}[keyof F];

function limitsFromFields<F extends Record<string, FieldDef<unknown>>>(
  fields: F,
): { [K in LimitKeys<F>]: LimitDef } {
  const output = {} as { [K in LimitKeys<F>]: LimitDef };

  for (const key of Object.keys(fields) as Array<keyof F>) {
    const limit = fields[key].limit;
    if (limit !== undefined) {
      (output as Record<string, LimitDef>)[key as string] = limit;
    }
  }

  return output;
}

const PRESET_DEFAULTS = defaultsFromFields(PRESET_FIELDS);
const SETTINGS_ONLY_DEFAULTS = defaultsFromFields(SETTINGS_ONLY_FIELDS);

type PresetFieldValues = typeof PRESET_DEFAULTS;
type SettingsOnlyFieldValues = typeof SETTINGS_ONLY_DEFAULTS;

export type PresetSnapshot = PresetFieldValues;

export interface PresetDefinition {
  id: PresetId;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: PresetSnapshot;
}

export type Settings = PresetFieldValues &
  SettingsOnlyFieldValues & {
    version: string;
  };

export const PRESET_SNAPSHOT_KEYS = Object.keys(PRESET_FIELDS) as ReadonlyArray<
  keyof PresetSnapshot
>;

const FIELD_LIMITS = {
  ...limitsFromFields(PRESET_FIELDS),
  ...limitsFromFields(SETTINGS_ONLY_FIELDS),
};

export const SETTINGS_LIMITS = {
  ...FIELD_LIMITS,
  stopBoundary: PRESET_FIELDS.cornerStopTL.limit,
  position: SETTINGS_ONLY_FIELDS.customStopZoneX.limit,
  stopZoneDimension: SETTINGS_ONLY_FIELDS.customStopZoneWidth.limit,
  sequencePointClicks: { min: 1, max: 100000 },
};

export const SETTINGS_UI_SCHEMA = [
  {
    id: "behavior",
    fields: [
      "alwaysOnTop",
      "showStopOverlay",
      "showStopReason",
      "strictHotkeyModifiers",
      "taskSwitcherStopEnabled",
      "extendedClickSpeedLimit",
    ],
  },
  {
    id: "startup",
    fields: ["minimizeToTray"],
  },
  {
    id: "appearance",
    fields: ["theme", "advancedSequenceLayout", "accentColor"],
  },
  {
    id: "presets",
    fields: ["presets", "activePresetId"],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  fields: ReadonlyArray<keyof Settings>;
}>;

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

export function getMaxClickSpeed(
  extendedClickSpeedLimit: boolean | null | undefined,
) {
  return extendedClickSpeedLimit
    ? EXTENDED_MAX_CLICK_SPEED
    : DEFAULT_MAX_CLICK_SPEED;
}

export function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
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

function sanitizeEnum<T extends string>(
  value: unknown,
  fallback: T,
  valid: readonly T[],
): T {
  return typeof value === "string" && valid.includes(value as T)
    ? (value as T)
    : fallback;
}

function sanitizeFields<F extends Record<string, FieldDef<unknown>>>(
  fields: F,
  input: Record<string, unknown>,
): DefaultValues<F> {
  const result: Record<string, unknown> = {};

  for (const [key, def] of Object.entries(fields)) {
    const raw = input[key];
    const fallback = def.default;

    if (typeof fallback === "number") {
      result[key] = clampNumber(raw, fallback, def.limit?.min, def.limit?.max);
      continue;
    }

    if (typeof fallback === "boolean") {
      result[key] = sanitizeBoolean(raw, fallback);
      continue;
    }

    if (typeof fallback === "string") {
      result[key] = typeof raw === "string" ? raw : fallback;
      continue;
    }

    if (fallback === null) {
      result[key] = typeof raw === "string" ? raw : fallback;
      continue;
    }

    result[key] = fallback;
  }

  return result as DefaultValues<F>;
}

function createFallbackPresetId(index: number) {
  return `preset-${index + 1}`;
}

function sanitizeRateInputMode(value: unknown, fallback: RateInputMode) {
  return sanitizeEnum(value, fallback, ["rate", "duration"]);
}

function sanitizeSavedPanel(value: unknown, fallback: SavedPanel) {
  return sanitizeEnum(value, fallback, ["simple", "advanced", "zones", "sequence"]);
}

function sanitizeTheme(value: unknown, fallback: Theme) {
  return sanitizeEnum(value, fallback, THEME_OPTIONS);
}

function sanitizeAdvancedSequenceLayout(
  value: unknown,
  fallback: AdvancedSequenceLayout,
) {
  return sanitizeEnum(value, fallback, ["wide", "tall"]);
}

function sanitizeProcessListEntries(value: unknown): ProcessListEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): ProcessListEntry | null => {
      if (typeof item === "string") {
        const name = item.trim().toLowerCase();
        if (!name) return null;
        return { name, behavior: "stop", enabled: true };
      }
      if (!item || typeof item !== "object") return null;
      const candidate = item as Partial<ProcessListEntry>;
      const name =
        typeof candidate.name === "string"
          ? candidate.name.trim().toLowerCase()
          : "";
      if (!name) return null;
      const behavior: ProcessListBehavior =
        candidate.behavior === "pause" ? "pause" : "stop";
      const enabled =
        typeof candidate.enabled === "boolean" ? candidate.enabled : true;
      return { name, behavior, enabled };
    })
    .filter((entry): entry is ProcessListEntry => entry !== null);
}

function sanitizeSequencePoints(value: unknown): SequencePoint[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((point) => {
      if (!point || typeof point !== "object") return null;
      const candidate = point as Partial<SequencePoint>;
      const id =
        typeof candidate.id === "string" && candidate.id.trim()
          ? candidate.id.trim()
          : createSequencePointId();
      const x =
        typeof candidate.x === "number" && Number.isFinite(candidate.x)
          ? Math.trunc(candidate.x)
          : null;
      const y =
        typeof candidate.y === "number" && Number.isFinite(candidate.y)
          ? Math.trunc(candidate.y)
          : null;
      const clicks =
        typeof candidate.clicks === "number" &&
        Number.isFinite(candidate.clicks)
          ? Math.trunc(candidate.clicks)
          : 1;

      if (x === null || y === null) return null;

      return {
        id,
        x,
        y,
        clicks: clampNumber(
          clicks,
          1,
          SETTINGS_LIMITS.sequencePointClicks.min,
          SETTINGS_LIMITS.sequencePointClicks.max,
        ),
      };
    })
    .filter((point): point is SequencePoint => point !== null);
}

export function createDefaultSettings(version: string): Settings {
  return {
    version,
    ...PRESET_DEFAULTS,
    ...SETTINGS_ONLY_DEFAULTS,
  };
}

export function buildPresetSnapshot(settings: Settings): PresetSnapshot {
  const snapshot: Record<string, unknown> = {};

  for (const key of PRESET_SNAPSHOT_KEYS) {
    snapshot[key] = settings[key];
  }

  return snapshot as PresetSnapshot;
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
  const saved = (input ?? {}) as Record<string, unknown>;
  const snapshot = sanitizeFields(PRESET_FIELDS, saved);

  snapshot.clickInterval = sanitizeEnum(
    saved.clickInterval,
    defaults.clickInterval,
    CLICK_INTERVAL_OPTIONS.map((option) => option.value),
  );
  snapshot.inputType = sanitizeEnum(saved.inputType, defaults.inputType, [
    "mouse",
    "keyboard",
  ]);
  snapshot.keyboardKeyCase = sanitizeEnum(
    saved.keyboardKeyCase,
    defaults.keyboardKeyCase,
    ["lower", "upper"],
  );
  snapshot.mouseButton = sanitizeEnum(
    saved.mouseButton,
    defaults.mouseButton,
    MOUSE_BUTTON_OPTIONS,
  );
  snapshot.mode = sanitizeEnum(saved.mode, defaults.mode, MODE_OPTIONS);
  snapshot.timeLimitUnit = sanitizeEnum(
    saved.timeLimitUnit,
    defaults.timeLimitUnit,
    TIME_LIMIT_UNIT_OPTIONS,
  );
  snapshot.processListMode = sanitizeEnum(
    saved.processListMode,
    defaults.processListMode,
    ["whitelist", "blacklist"],
  );
  snapshot.sequencePoints = sanitizeSequencePoints(saved.sequencePoints);
  snapshot.processListEntries = sanitizeProcessListEntries(
    saved.processListEntries,
  );

  return snapshot;
}

function sanitizePresets(
  input: unknown,
  defaults: Settings,
): PresetDefinition[] {
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
  const savedRecord = saved as Record<string, unknown>;

  const presetSettings = sanitizeFields(PRESET_FIELDS, savedRecord);
  const settingsOnly = sanitizeFields(SETTINGS_ONLY_FIELDS, savedRecord);

  const legacySpeedVariation = clampNumber(
    saved.speedVariationMax,
    defaults.speedVariation,
    SETTINGS_LIMITS.speedVariation.min,
    SETTINGS_LIMITS.speedVariation.max,
  );

  presetSettings.clickInterval = sanitizeEnum(
    saved.clickInterval,
    defaults.clickInterval,
    CLICK_INTERVAL_OPTIONS.map((option) => option.value),
  );
  presetSettings.inputType = sanitizeEnum(saved.inputType, defaults.inputType, [
    "mouse",
    "keyboard",
  ]);
  presetSettings.keyboardKeyCase = sanitizeEnum(
    saved.keyboardKeyCase,
    defaults.keyboardKeyCase,
    ["lower", "upper"],
  );
  presetSettings.mouseButton = sanitizeEnum(
    saved.mouseButton,
    defaults.mouseButton,
    MOUSE_BUTTON_OPTIONS,
  );
  presetSettings.mode = sanitizeEnum(saved.mode, defaults.mode, MODE_OPTIONS);
  presetSettings.timeLimitUnit = sanitizeEnum(
    saved.timeLimitUnit,
    defaults.timeLimitUnit,
    TIME_LIMIT_UNIT_OPTIONS,
  );
  presetSettings.processListMode = sanitizeEnum(
    saved.processListMode,
    defaults.processListMode,
    ["whitelist", "blacklist"],
  );
  presetSettings.sequencePoints = sanitizeSequencePoints(saved.sequencePoints);
  presetSettings.processListEntries = sanitizeProcessListEntries(
    saved.processListEntries,
  );
  presetSettings.speedVariation = clampNumber(
    saved.speedVariation,
    legacySpeedVariation,
    SETTINGS_LIMITS.speedVariation.min,
    SETTINGS_LIMITS.speedVariation.max,
  );

  settingsOnly.rateInputMode = sanitizeRateInputMode(
    saved.rateInputMode,
    defaults.rateInputMode,
  );
  settingsOnly.lastPanel = sanitizeSavedPanel(
    saved.lastPanel,
    defaults.lastPanel,
  );
  settingsOnly.theme = sanitizeTheme(saved.theme, defaults.theme);
  settingsOnly.advancedSequenceLayout = sanitizeAdvancedSequenceLayout(
    saved.advancedSequenceLayout,
    defaults.advancedSequenceLayout,
  );
  settingsOnly.alwaysOnTop = sanitizeBoolean(
    saved.alwaysOnTop,
    defaults.alwaysOnTop,
  );
  settingsOnly.accentColor = sanitizeHexColor(
    saved.accentColor,
    defaults.accentColor,
  );
  presetSettings.clickSpeed = clampNumber(
    saved.clickSpeed,
    presetSettings.clickSpeed,
    SETTINGS_LIMITS.clickSpeed.min,
    getMaxClickSpeed(settingsOnly.extendedClickSpeedLimit),
  );
  settingsOnly.disableScreenshots = false;
  settingsOnly.presets = sanitizePresets(saved.presets, defaults);
  settingsOnly.activePresetId =
    typeof saved.activePresetId === "string" &&
    settingsOnly.presets.some((preset) => preset.id === saved.activePresetId)
      ? saved.activePresetId
      : null;

  return {
    version,
    ...presetSettings,
    ...settingsOnly,
  };
}
