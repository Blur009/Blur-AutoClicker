import { getVersion } from "@tauri-apps/api/app";
import { LazyStore } from "@tauri-apps/plugin-store";
import {
  createDefaultSettings,
  sanitizeSettings,
  type Settings,
} from "./settingsSchema";

const store = new LazyStore("settings.json");

export const APP_VERSION = await getVersion();

export type {
  ClickInterval,
  ClickMode,
  InputType,
  MouseButton,
  PresetDefinition,
  PresetId,
  PresetSnapshot,
  RateInputMode,
  SavedPanel,
  SequencePoint,
  Settings,
  Theme,
  TimeLimitUnit,
} from "./settingsSchema";

export interface ClickerStatus {
  running: boolean;
  clickCount: number;
  lastError: string | null;
  stopReason: string | null;
  activeSequenceIndex: number | null;
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
