import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { LazyStore } from "@tauri-apps/plugin-store";
import { logDiagnostic } from "./diagnostics";
import {
  createDefaultSettings,
  sanitizeSettings,
  withFactoryPresets,
  type Settings,
} from "./settingsSchema";

export let APP_VERSION = "0.0.0";

export interface PortableInfo {
  portable: boolean;
  dataDir: string | null;
}

let portableInfoPromise: Promise<PortableInfo> | null = null;
let storePromise: Promise<LazyStore> | null = null;
let recoveredSettingsBackup: string | null = null;

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

export interface BlockedWindowLabel {
  name: string;
  title: string;
}

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
  elevationBlockedWindow: BlockedWindowLabel | null;
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
  const backup = await backupUnreadableSettings();
  if (backup) {
    recoveredSettingsBackup = backup;
    await warnUnreadableSettings(null, backup);
  }

  try {
    const saved = await store.get<Partial<Settings>>("settings");
    return sanitizeSettings(saved, APP_VERSION);
  } catch (err) {
    await warnUnreadableSettings(err, backup);
    throw err;
  }
}

async function backupUnreadableSettings(): Promise<string | null> {
  return invoke<string | null>("backup_unreadable_settings").catch(() => null);
}

function unreadableSettingsWarning(backup: string | null): string {
  return backup
    ? `Settings could not be read and were reset. Your old file is saved as ${backup}.`
    : "Settings could not be read and were reset.";
}

export function settingsRecoveryWarning(): string | null {
  if (!recoveredSettingsBackup) {
    return null;
  }
  return unreadableSettingsWarning(recoveredSettingsBackup);
}

async function warnUnreadableSettings(
  err: unknown,
  backup: string | null,
): Promise<void> {
  logDiagnostic("Store.loadSettings", {
    error: err === null ? null : String(err),
    backup,
  });

  await invoke("set_settings_warning", {
    warning: unreadableSettingsWarning(backup),
  }).catch(() => undefined);
}

export async function saveSettings(settings: Settings): Promise<void> {
  const store = await getStore();
  await store.set("settings", sanitizeSettings(settings, APP_VERSION));
  await store.save();
}

export async function clearSavedSettings(): Promise<void> {
  const store = await getStore();
  await store.set("settings", withFactoryPresets(DEFAULT_SETTINGS));
  await store.save();
}
