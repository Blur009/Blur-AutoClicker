import { getVersion } from "@tauri-apps/api/app";
import { LazyStore } from "@tauri-apps/plugin-store";
import {
  createDefaultSettings,
  sanitizeSettings,
  type Settings,
} from "./settingsSchema";

const store = new LazyStore("settings.json");

export let APP_VERSION = "0.0.0";

export async function initAppVersion(): Promise<void> {
  APP_VERSION = await getVersion();
}

export type {
  ClickInterval,
  ClickMode,
  InputType,
  KeyboardKeyCase,
  MouseButton,
  PresetDefinition,
  PresetId,
  PresetSnapshot,
  RateInputMode,
  SavedPanel,
  ClickPoint,
  Settings,
  Theme,
  TimeLimitUnit,
} from "./settingsSchema";

export interface ClickerStatus {
  running: boolean;
  paused: boolean;
  clickCount: number;
  lastError: string | null;
  stopReason: string | null;
  warning: string | null;
  activeClickPointIndex: number | null;
  activeClickPointTick: number;
}

export interface AppInfo {
  version: string;
  updateStatus: string;
  screenshotProtectionSupported: boolean;
}

export const DEFAULT_SETTINGS: Settings = createDefaultSettings(APP_VERSION);

export async function loadSettings(): Promise<Settings> {
  const saved = await store.get<Partial<Settings>>("settings");
  return sanitizeSettings(saved, APP_VERSION);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await store.set("settings", sanitizeSettings(settings, APP_VERSION));
  await store.save();
}

export async function clearSavedSettings(): Promise<void> {
  await store.set("settings", DEFAULT_SETTINGS);
  await store.save();
}
