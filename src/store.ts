import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { LazyStore } from "@tauri-apps/plugin-store";
import {
  createDefaultSettings,
  sanitizeSettings,
  type Settings,
} from "./settingsSchema";

export let APP_VERSION = "0.0.0";

export interface PortableInfo {
  portable: boolean;
  dataDir: string | null;
}

let portableInfoPromise: Promise<PortableInfo> | null = null;
let storePromise: Promise<LazyStore> | null = null;

async function getPortableInfo(): Promise<PortableInfo> {
  if (!portableInfoPromise) {
    portableInfoPromise = invoke<PortableInfo>("get_portable_info").catch(
      (e) => {
        portableInfoPromise = null;
        throw e;
      },
    );
  }
  return portableInfoPromise;
}

export function isPortableMode(): Promise<boolean> {
  return getPortableInfo().then((info) => info.portable);
}

async function resolveStorePath(): Promise<string> {
  const info = await getPortableInfo();
  if (info.portable && info.dataDir) {
    return `${info.dataDir}/settings.json`;
  }
  return "settings.json";
}

export function getStore(): Promise<LazyStore> {
  if (!storePromise) {
    storePromise = (async () =>
      new LazyStore(await resolveStorePath()))().catch((e) => {
      storePromise = null;
      throw e;
    });
  }
  return storePromise;
}

export async function initAppVersion(): Promise<void> {
  APP_VERSION = await getVersion();
}

export type {
  ClickInterval,
  ClickMode,
  IndicatorBackgroundMode,
  IndicatorColorMode,
  IndicatorCorner,
  IndicatorCountdownMode,
  InputType,
  KeyboardKeyCase,
  MouseButton,
  PresetDefinition,
  PresetId,
  PresetSnapshot,
  RateInputMode,
  SavedPanel,
  ClickPoint,
  StopZone,
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
  masterAllowed: boolean;
  elevationBlocked: boolean;
}

export interface AppInfo {
  version: string;
  updateStatus: string;
  screenshotProtectionSupported: boolean;
  portable: boolean;
}

export const DEFAULT_SETTINGS: Settings = createDefaultSettings(APP_VERSION);

export async function loadSettings(): Promise<Settings> {
  const store = await getStore();
  const saved = await store.get<Partial<Settings>>("settings");
  return sanitizeSettings(saved, APP_VERSION);
}

export async function saveSettings(settings: Settings): Promise<void> {
  const store = await getStore();
  await store.set("settings", sanitizeSettings(settings, APP_VERSION));
  await store.save();
}

export async function clearSavedSettings(): Promise<void> {
  const store = await getStore();
  await store.set("settings", DEFAULT_SETTINGS);
  await store.save();
}
