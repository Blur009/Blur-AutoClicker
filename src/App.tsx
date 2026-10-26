import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { exit } from "@tauri-apps/plugin-process";
import {
  currentMonitor,
  getCurrentWindow,
  LogicalSize,
  monitorFromPoint,
  PhysicalPosition,
} from "@tauri-apps/api/window";
import {
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useThemeRuntime } from "./themeRuntime";
import {
  logDiagnostic,
  logWarning,
  serializeDiagnosticValue,
} from "./diagnostics";
import {
  getExtension,
  isLegacyVideoExtension,
  resolveBackgroundSource,
} from "./backgroundMedia";
import ElevationPrompt from "./components/ElevationPrompt";
import UpdateBanner from "./components/Updatebanner";
import {
  buildHotkeyWithHeld,
  canonicalizeHotkeyForBackend,
  captureHotkey,
  captureModifierHotkey,
  getMainKey,
} from "./hotkeys";

import {
  applyPresetSnapshot,
  buildPresetSnapshot,
  createPresetDefinition,
  sanitizePresetSnapshot,
  sanitizeSettings,
  sanitizePresetName,
  withFactoryPresets,
  type PresetDefinition,
  type PresetId,
} from "./settingsSchema";
import { save, open } from "@tauri-apps/plugin-dialog";
import {
  APP_VERSION,
  DEFAULT_SETTINGS,
  initAppVersion,
  type AppInfo,
  type ClickerStatus,
  type Settings,
  clearSavedSettings,
  loadSettings,
  saveSettings,
  settingsRecoveryWarning,
} from "./store";
import { restartAsAdministrator } from "./restart";
import { holdModePatch } from "./cadence";

void initAppVersion();

const SimplePanel = lazy(() => import("./components/panels/SimplePanel"));
const AdvancedPanel = lazy(
  () => import("./components/panels/advanced/AdvancedPanel"),
);
const ZonesPanel = lazy(() => import("./components/panels/zones/ZonesPanel"));
const SettingsPanel = lazy(
  () => import("./components/panels/settings/SettingsPanel"),
);
const ClickPointsPanel = lazy(
  () => import("./components/panels/click-points/ClickPointsPanel"),
);
const TitleBar = lazy(() => import("./components/TitleBar"));
const StatusBar = lazy(() => import("./components/StatusBar"));
export type Tab = "simple" | "advanced" | "zones" | "settings" | "click-points";

const BACKEND_SETTINGS_SCHEMA_VERSION = 11;
const MAX_DROPDOWN_OVERFLOW_BOTTOM = 220;
const STATUS_BAR_HEIGHT = 26;

type DropdownOverflowDetail = {
  active: boolean;
  bottom?: number;
};

function getPanelSize(tab: Tab, hasUpdate: boolean) {
  const extra = hasUpdate ? 30 : 0;
  if (tab === "simple") {
    return { width: 750, height: 175 + extra };
  }
  if (tab === "settings") return { width: 700, height: 720 + extra };
  if (tab === "zones") return { width: 700, height: 700 + extra };
  if (tab === "click-points") return { width: 550, height: 600 + extra };
  return { width: 900, height: 469 + extra };
}

async function getClampedPanelSize(
  size: { width: number; height: number },
  textScale: number,
) {
  const monitor = await currentMonitor();
  if (!monitor) return size;

  const scale = monitor.scaleFactor || 1;
  const workAreaWidth = Math.floor(monitor.workArea.size.width / scale);
  const workAreaHeight = Math.floor(monitor.workArea.size.height / scale);
  const horizontalMargin = 24;
  const verticalMargin = 24;

  return {
    width: Math.min(
      Math.ceil(size.width * textScale),
      Math.max(360, workAreaWidth - horizontalMargin),
    ),
    height: Math.min(
      Math.ceil(size.height * textScale),
      Math.max(220, workAreaHeight - verticalMargin),
    ),
  };
}

async function isPointOnMonitor(x: number, y: number): Promise<boolean> {
  try {
    return (await monitorFromPoint(x, y)) !== null;
  } catch {
    // If the monitor lookup fails, keep the saved position rather than forcing
    // a recenter on every launch.
    return true;
  }
}

const DEFAULT_STATUS: ClickerStatus = {
  running: false,
  paused: false,
  clickCount: 0,
  lastError: null,
  stopReason: null,
  warning: null,
  activeClickPointIndex: null,
  activeClickPointTick: 0,
  masterAllowed: true,
  elevationBlocked: false,
  elevationBlockedWindow: null,
};

const DEFAULT_APP_INFO: AppInfo = {
  version: APP_VERSION,
  updateStatus: "Update checks are disabled in development",
  screenshotProtectionSupported: false,
  portable: false,
};

async function syncSettingsToBackend(settings: Settings) {
  const backendSettings = Object.fromEntries(
    Object.entries(settings).filter(
      ([key]) => key !== "themeProfiles" && key !== "activeThemeProfileId",
    ),
  );
  await invoke("update_settings", {
    settings: {
      ...backendSettings,
      version: BACKEND_SETTINGS_SCHEMA_VERSION,
    },
  });
}

async function registerHotkeyCandidate(hotkey: string) {
  const canonicalHotkey = await canonicalizeHotkeyForBackend(hotkey);
  return invoke<string>("register_hotkey", { hotkey: canonicalHotkey });
}

type UpdateCheckResult = {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
};

async function checkForUpdates(): Promise<UpdateCheckResult | null> {
  try {
    return await invoke<UpdateCheckResult>("check_for_updates");
  } catch (err) {
    logDiagnostic("App.updateCheck", {
      error: serializeDiagnosticValue(err),
    });
    return null;
  }
}

const MIN_TEXT_SCALE = 0.5;
const MAX_TEXT_SCALE = 4;

function sanitizeTextScale(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, value));
}

function tabSuffix(t: Tab): string {
  if (t === "click-points") return "ClickPoints";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function resolvePerPage<T>(settings: Settings, globalVal: T, field: string): T {
  if (settings.perPageAppearance) {
    return ((settings as Record<string, unknown>)[field] as T) ?? globalVal;
  }
  return globalVal;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("simple");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [status, setStatus] = useState<ClickerStatus>(DEFAULT_STATUS);
  const [elevation, setElevation] = useState({
    elevated: false,
    canElevate: false,
  });
  const [elevationLoaded, setElevationLoaded] = useState(false);
  const [promptBusy, setPromptBusy] = useState(false);
  const elevationRelaunchedRef = useRef(false);
  const [appInfo, setAppInfo] = useState<AppInfo>(DEFAULT_APP_INFO);
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string;
    latestVersion: string;
  } | null>(null);
  const [updateCheckStatus, setUpdateCheckStatus] = useState<
    "idle" | "checking" | "available" | "unavailable" | "error"
  >("idle");
  const [dropdownOverflowBottom, setDropdownOverflowBottom] = useState(0);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    string | undefined
  >();

  const hotkeyTimer = useRef<number | null>(null);
  const hotkeyRequestIdRef = useRef(0);
  const uiSettingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const committedSettingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const lastValidHotkeyRef = useRef(DEFAULT_SETTINGS.hotkey);
  const launchWindowPlacementDone = useRef(false);
  const pendingShowWindowRef = useRef(false);
  const bootTextScaleRef = useRef<number | null>(null);
  const bootPhasesRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mountedRef = useRef(false);

  const setUiSettings = (nextSettings: Settings) => {
    uiSettingsRef.current = nextSettings;
    setSettings(nextSettings);
  };

  const scheduleSave = (nextSettings: Settings) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      saveSettings(nextSettings).catch((err) => {
        logDiagnostic("App.saveSettings", {
          error: String(err),
        });
      });
    }, 100);
  };

  const scheduleSaveRef = useRef(scheduleSave);

  const persistCommittedSettings = (
    nextCommittedSettings: Settings,
    nextUiSettings: Settings,
  ) => {
    committedSettingsRef.current = nextCommittedSettings;
    setUiSettings(nextUiSettings);

    if (!settingsLoaded) {
      return;
    }

    syncSettingsToBackend(nextCommittedSettings).catch((err) => {
      logDiagnostic("App.syncSettings", {
        error: String(err),
      });
    });
    scheduleSave(nextCommittedSettings);
  };

  const restoreLastValidHotkey = () => {
    const restoredHotkey = lastValidHotkeyRef.current;
    if (uiSettingsRef.current.hotkey === restoredHotkey) {
      return;
    }

    setUiSettings({
      ...uiSettingsRef.current,
      hotkey: restoredHotkey,
    });
  };

  const queueHotkeyRegistration = (hotkey: string) => {
    if (!settingsLoaded) {
      return;
    }

    if (hotkeyTimer.current !== null) {
      window.clearTimeout(hotkeyTimer.current);
    }

    const requestId = ++hotkeyRequestIdRef.current;
    hotkeyTimer.current = window.setTimeout(() => {
      hotkeyTimer.current = null;

      registerHotkeyCandidate(hotkey)
        .then((normalizedHotkey) => {
          if (hotkeyRequestIdRef.current !== requestId) {
            return;
          }

          lastValidHotkeyRef.current = normalizedHotkey;
          const nextCommittedSettings = {
            ...committedSettingsRef.current,
            hotkey: normalizedHotkey,
          };
          const nextUiSettings = {
            ...uiSettingsRef.current,
            hotkey: normalizedHotkey,
          };

          persistCommittedSettings(nextCommittedSettings, nextUiSettings);
        })
        .catch((err) => {
          if (hotkeyRequestIdRef.current !== requestId) {
            return;
          }

          logDiagnostic("App.registerHotkey", {
            error: String(err),
          });

          if (!hotkey) {
            lastValidHotkeyRef.current = "";
          } else {
            restoreLastValidHotkey();
          }
        });
    }, 250);
  };

  const persistCommittedSettingsRef = useRef(persistCommittedSettings);
  const setUiSettingsRef = useRef(setUiSettings);
  const queueHotkeyRegistrationRef = useRef(queueHotkeyRegistration);

  useLayoutEffect(() => {
    persistCommittedSettingsRef.current = persistCommittedSettings;
    setUiSettingsRef.current = setUiSettings;
    queueHotkeyRegistrationRef.current = queueHotkeyRegistration;
    scheduleSaveRef.current = scheduleSave;
  });

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const { hotkey, ...rest } = patch;

    if (Object.keys(rest).length > 0) {
      const uiBase = uiSettingsRef.current;
      const nextCommittedSettings = sanitizeSettings(
        { ...committedSettingsRef.current, ...rest },
        APP_VERSION,
      );
      const nextUiSettings = {
        ...nextCommittedSettings,
        hotkey: uiBase.hotkey,
      };

      persistCommittedSettingsRef.current(
        nextCommittedSettings,
        nextUiSettings,
      );
    }

    if (hotkey !== undefined) {
      setUiSettingsRef.current({
        ...uiSettingsRef.current,
        hotkey,
      });
      queueHotkeyRegistrationRef.current(hotkey);
    }
  }, []);

  const applyStartupWindowPlacement = async () => {
    const settings = committedSettingsRef.current;
    const savedX = settings.windowPosition.x;
    const savedY = settings.windowPosition.y;

    if (settings.rememberWindowPosition && savedX !== null && savedY !== null) {
      if (await isPointOnMonitor(savedX, savedY)) {
        await getCurrentWindow().setPosition(
          new PhysicalPosition(savedX, savedY),
        );
        return;
      }
      // A saved position can land off-screen after a monitor is unplugged or
      // the resolution / scaling changes. Center rather than show a window the
      // user cannot see or reach.
      logWarning("App.windowPlacement", {
        error: `saved window position (${savedX}, ${savedY}) is off-screen, centering`,
      });
    }

    await getCurrentWindow().center();
  };

  const handleWindowClose = useCallback(async () => {
    if (committedSettingsRef.current.rememberWindowPosition) {
      const pos = await getCurrentWindow().outerPosition();
      const next = sanitizeSettings(
        {
          ...committedSettingsRef.current,
          windowPosition: { x: pos.x, y: pos.y },
        },
        APP_VERSION,
      );
      await saveSettings(next);
    }
    if (uiSettingsRef.current.minimizeToTray) {
      await invoke("clear_elevation_blocked").catch(() => {});
      await invoke("hide_main_window");
    } else {
      await invoke("quit_app");
    }
  }, []);

  const handleToggleAlwaysOnTop = useCallback(async () => {
    const nextValue = !committedSettingsRef.current.alwaysOnTop;

    try {
      await getCurrentWindow().setAlwaysOnTop(nextValue);
      updateSettings({
        alwaysOnTop: nextValue,
      });
    } catch (err) {
      logDiagnostic("App.alwaysOnTop", {
        error: String(err),
      });
    }
  }, [updateSettings]);

  const handleSavePreset = (name: string) => {
    if (status.running) {
      return false;
    }

    const preset = createPresetDefinition(name, committedSettingsRef.current);
    if (!preset.name) {
      return false;
    }

    const nextPresets = [...committedSettingsRef.current.presets, preset];
    const nextCommittedSettings = {
      ...committedSettingsRef.current,
      presets: nextPresets,
      activePresetId: preset.id,
    };
    const nextUiSettings = {
      ...uiSettingsRef.current,
      presets: nextPresets,
      activePresetId: preset.id,
    };

    persistCommittedSettings(nextCommittedSettings, nextUiSettings);
    return true;
  };

  const handleApplyPreset = (presetId: PresetId) => {
    if (status.running) {
      return false;
    }

    const preset = committedSettingsRef.current.presets.find(
      (item) => item.id === presetId,
    );
    if (!preset) {
      return false;
    }

    const current = committedSettingsRef.current;
    const nextMode = preset.settings.dutyCycleMode ?? current.dutyCycleMode;
    const transition =
      current.dutyCycleMode === "Hold" && nextMode !== "Hold"
        ? holdModePatch(current, false)
        : current.dutyCycleMode !== "Hold" && nextMode === "Hold"
          ? holdModePatch(current, true)
          : {};

    updateSettings({
      ...preset.settings,
      ...transition,
      activePresetId: presetId,
    });
    return true;
  };

  const handleUpdatePreset = (presetId: PresetId) => {
    if (status.running) {
      return false;
    }

    const nextSnapshot = buildPresetSnapshot(committedSettingsRef.current);

    let updated = false;
    const nextPresets = committedSettingsRef.current.presets.map((preset) => {
      if (preset.id !== presetId) {
        return preset;
      }

      updated = true;
      return {
        ...preset,
        updatedAt: new Date().toISOString(),
        settings: nextSnapshot,
      };
    });

    if (!updated) {
      return false;
    }

    const nextCommittedSettings = {
      ...committedSettingsRef.current,
      presets: nextPresets,
      activePresetId: presetId,
    };
    const nextUiSettings = {
      ...uiSettingsRef.current,
      presets: nextPresets,
      activePresetId: presetId,
    };

    persistCommittedSettings(nextCommittedSettings, nextUiSettings);
    return true;
  };

  const handleRenamePreset = (presetId: PresetId, name: string) => {
    if (status.running) {
      return false;
    }

    const sanitizedName = sanitizePresetName(name);
    if (!sanitizedName) {
      return false;
    }

    let updated = false;
    const nextPresets = committedSettingsRef.current.presets.map((preset) => {
      if (preset.id !== presetId) {
        return preset;
      }

      updated = true;
      return {
        ...preset,
        name: sanitizedName,
        updatedAt: new Date().toISOString(),
      };
    });

    if (!updated) {
      return false;
    }

    const nextCommittedSettings = {
      ...committedSettingsRef.current,
      presets: nextPresets,
    };
    const nextUiSettings = {
      ...uiSettingsRef.current,
      presets: nextPresets,
    };

    persistCommittedSettings(nextCommittedSettings, nextUiSettings);
    return true;
  };

  const handleDeletePreset = (presetId: PresetId) => {
    if (status.running) {
      return false;
    }

    const nextPresets = committedSettingsRef.current.presets.filter(
      (preset) => preset.id !== presetId,
    );
    if (nextPresets.length === committedSettingsRef.current.presets.length) {
      return false;
    }

    const nextActivePresetId =
      committedSettingsRef.current.activePresetId === presetId
        ? null
        : committedSettingsRef.current.activePresetId;

    const nextCommittedSettings = {
      ...committedSettingsRef.current,
      presets: nextPresets,
      activePresetId: nextActivePresetId,
    };
    const nextUiSettings = {
      ...uiSettingsRef.current,
      presets: nextPresets,
      activePresetId: nextActivePresetId,
    };

    persistCommittedSettings(nextCommittedSettings, nextUiSettings);
    return true;
  };

  const handleDuplicatePreset = (presetId: PresetId) => {
    if (status.running) {
      return false;
    }

    const source = committedSettingsRef.current.presets.find(
      (p) => p.id === presetId,
    );
    if (!source) {
      return false;
    }

    const baseName = source.name.replace(/\s*\(\d+\)$/, "");
    let newName = `${baseName} (2)`;
    let counter = 2;
    while (
      committedSettingsRef.current.presets.some((p) => p.name === newName)
    ) {
      counter++;
      newName = `${baseName} (${counter})`;
    }

    const preset = createPresetDefinition(
      newName,
      applyPresetSnapshot(committedSettingsRef.current, source.settings),
    );
    if (!preset.name) {
      return false;
    }

    const nextPresets = [...committedSettingsRef.current.presets, preset];
    const nextCommittedSettings = {
      ...committedSettingsRef.current,
      presets: nextPresets,
    };
    const nextUiSettings = {
      ...uiSettingsRef.current,
      presets: nextPresets,
    };

    persistCommittedSettings(nextCommittedSettings, nextUiSettings);
    return true;
  };

  const handleExportPreset = async (presetId: PresetId) => {
    const preset = committedSettingsRef.current.presets.find(
      (p) => p.id === presetId,
    );
    if (!preset) {
      return false;
    }

    try {
      const filePath = await save({
        defaultPath: `${preset.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`,
        filters: [{ name: "Preset JSON", extensions: ["json"] }],
      });
      if (!filePath) {
        return false;
      }

      await invoke("export_preset_file", { path: filePath, preset });
      return true;
    } catch (err) {
      logDiagnostic("App.exportPreset", { error: String(err) });
      return false;
    }
  };

  const handleImportPreset = async () => {
    try {
      const filePath = await open({
        multiple: false,
        filters: [{ name: "Preset JSON", extensions: ["json"] }],
      });
      if (!filePath) {
        return null;
      }

      const parsed = await invoke<{
        type?: string;
        version?: number;
        preset?: PresetDefinition;
      }>("import_preset_file", { path: filePath });

      if (parsed.type !== "blur-autoclicker-preset" || !parsed.preset) {
        return null;
      }

      const importName = sanitizePresetName(parsed.preset.name);
      if (!importName) {
        return null;
      }

      let finalName = importName;
      let counter = 1;
      while (
        committedSettingsRef.current.presets.some((p) => p.name === finalName)
      ) {
        counter++;
        finalName = `${importName} (${counter})`;
      }

      const now = new Date().toISOString();
      const id =
        globalThis.crypto?.randomUUID?.() ??
        `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const defaultSnapshot = buildPresetSnapshot(committedSettingsRef.current);
      const sanitizedSettings = sanitizePresetSnapshot(
        parsed.preset.settings,
        defaultSnapshot,
      );

      const preset: PresetDefinition = {
        id,
        name: finalName,
        createdAt: now,
        updatedAt: now,
        settings: sanitizedSettings,
      };

      const nextPresets = [...committedSettingsRef.current.presets, preset];
      const nextCommittedSettings = {
        ...committedSettingsRef.current,
        presets: nextPresets,
      };
      const nextUiSettings = {
        ...uiSettingsRef.current,
        presets: nextPresets,
      };

      persistCommittedSettings(nextCommittedSettings, nextUiSettings);
      return true;
    } catch (err) {
      logDiagnostic("App.importPreset", { error: String(err) });
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;
    mountedRef.current = true;
    const phaseStart = performance.now();
    const phases: string[] = [];
    const recordPhase = (label: string) => {
      phases.push(`${label} ${Math.round(performance.now() - phaseStart)}`);
      bootPhasesRef.current = phases.join(", ");
    };

    const readyTimers: number[] = [];
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      readyTimers.push(
        window.setTimeout(() => {
          emit("frontend-ready", {}).catch((err) =>
            logDiagnostic("App.frontendReadyRetry", { error: String(err) }),
          );
        }, attempt * 400),
      );
    }

    emit("frontend-ready", {}).catch((err) =>
      logDiagnostic("App.frontendReady", { error: String(err) }),
    );

    invoke<number>("get_text_scale_factor")
      .then((rawScale) => {
        const textScale = sanitizeTextScale(rawScale);
        bootTextScaleRef.current = textScale;
        return invoke("set_webview_zoom", { factor: 1.0 / textScale });
      })
      .catch((err) =>
        logDiagnostic("App.setZoom", {
          error: String(err),
        }),
      );

    void Promise.all([
      loadSettings(),
      invoke<AppInfo>("get_app_info"),
      invoke<ClickerStatus>("get_status"),
      invoke<boolean>("was_autostart_launch"),
    ])
      .then(
        async ([
          loadedSettings,
          loadedAppInfo,
          loadedStatus,
          autostartLaunch,
        ]) => {
          if (!mounted) return;
          recordPhase("load");

          let hydratedSettings = loadedSettings;

          let registeredHotkey: string;
          try {
            registeredHotkey = await registerHotkeyCandidate(
              loadedSettings.hotkey,
            );
          } catch (err) {
            logDiagnostic("App.registerSavedHotkey", {
              error: String(err),
            });
            registeredHotkey = lastValidHotkeyRef.current;
          }
          recordPhase("hotkey");

          if (registeredHotkey !== hydratedSettings.hotkey) {
            hydratedSettings = {
              ...hydratedSettings,
              hotkey: registeredHotkey,
            };
          }

          try {
            await getCurrentWindow().setAlwaysOnTop(
              hydratedSettings.alwaysOnTop,
            );
          } catch (err) {
            logDiagnostic("App.restoreAlwaysOnTop", {
              error: String(err),
            });
            hydratedSettings = {
              ...hydratedSettings,
              alwaysOnTop: false,
            };
          }

          lastValidHotkeyRef.current = hydratedSettings.hotkey;
          uiSettingsRef.current = hydratedSettings;
          committedSettingsRef.current = hydratedSettings;

          setTab(hydratedSettings.lastPanel);
          setSettings(hydratedSettings);
          setAppInfo(loadedAppInfo);
          setStatus(loadedStatus);
          if (loadedStatus.elevationBlocked) {
            setTab((current) => (current === "simple" ? "advanced" : current));
          }
          pendingShowWindowRef.current = !autostartLaunch;
          setSettingsLoaded(true);
          recordPhase("hydrate");

          await syncSettingsToBackend(hydratedSettings);
          recordPhase("sync");

          const recoveryWarning = settingsRecoveryWarning();
          if (recoveryWarning) {
            await invoke("set_settings_warning", {
              warning: recoveryWarning,
            }).catch((err) =>
              logDiagnostic("App.settingsWarning", {
                error: String(err),
              }),
            );
            setStatus((current) => ({
              ...current,
              warning: recoveryWarning,
            }));
          }

          if (
            hydratedSettings.hotkey !== loadedSettings.hotkey ||
            hydratedSettings.alwaysOnTop !== loadedSettings.alwaysOnTop
          ) {
            await saveSettings(hydratedSettings);
          }
          recordPhase("save");
        },
      )
      .catch((err) => {
        logDiagnostic("App.boot", {
          error: String(err),
        });
        if (!mounted) return;
        setSettingsLoaded(true);
        pendingShowWindowRef.current = true;
        emit("frontend-ready", {}).catch((err) =>
          logDiagnostic("App.bootEmit", {
            error: String(err),
          }),
        );
      });

    return () => {
      mountedRef.current = false;
      mounted = false;
      readyTimers.forEach((timer) => window.clearTimeout(timer));
      if (hotkeyTimer.current !== null) {
        window.clearTimeout(hotkeyTimer.current);
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      if (resizeTimeout.current) {
        clearTimeout(resizeTimeout.current);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const toggleTimer = toggleTimerRef.current;
      if (toggleTimer) {
        clearTimeout(toggleTimer);
      }
    };
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    listen<ClickerStatus>("clicker-status", (event) => {
      setStatus(event.payload);
      if (event.payload.elevationBlocked) {
        setTab((current) => (current === "simple" ? "advanced" : current));
      }
    })
      .then((unlisten) => {
        cleanup = unlisten;
      })
      .catch((err) => {
        logDiagnostic("App.statusListener", {
          error: String(err),
        });
      });

    return () => {
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    const handleDropdownOverflow = (event: Event) => {
      const { active, bottom = 0 } = (
        event as CustomEvent<DropdownOverflowDetail>
      ).detail;
      const nextOverflow = active
        ? Math.min(Math.max(0, bottom), MAX_DROPDOWN_OVERFLOW_BOTTOM)
        : 0;

      setDropdownOverflowBottom(nextOverflow);
    };

    window.addEventListener("blur-dropdown-overflow", handleDropdownOverflow);

    return () => {
      window.removeEventListener(
        "blur-dropdown-overflow",
        handleDropdownOverflow,
      );
    };
  }, []);

  useEffect(() => {
    if (resizeTimeout.current) {
      clearTimeout(resizeTimeout.current);
      resizeTimeout.current = null;
    }

    if (!settingsLoaded) return;

    let cancelled = false;
    const root = document.querySelector(".app-root") as HTMLElement;
    let transitionHandler: ((e: TransitionEvent) => void) | null = null;

    void (async () => {
      try {
        const bootTextScale = bootTextScaleRef.current;
        bootTextScaleRef.current = null;
        const textScale = sanitizeTextScale(
          bootTextScale ?? (await invoke<number>("get_text_scale_factor")),
        );
        document.documentElement.style.fontSize = `${16 * textScale}px`;

        const preferredSize = getPanelSize(tab, !!updateInfo);
        const { width, height } = await getClampedPanelSize(
          preferredSize,
          textScale,
        );
        const statusBarOffset = settings.statusBarEnabled
          ? STATUS_BAR_HEIGHT
          : 0;
        const appHeight = height + statusBarOffset;
        const windowHeight = appHeight + dropdownOverflowBottom;

        const appWindow = getCurrentWindow();

        if (!launchWindowPlacementDone.current) {
          if (cancelled) return;
          await appWindow.setSize(new LogicalSize(width, windowHeight));

          if (cancelled) return;
          root.style.width = `${width}px`;
          root.style.height = `${appHeight}px`;

          if (cancelled) return;
          await applyStartupWindowPlacement();
          if (pendingShowWindowRef.current) {
            pendingShowWindowRef.current = false;
            await invoke("prepare_main_window").catch(() => {});
            await appWindow.show();
            invoke("report_startup_ready", {
              visible: true,
              frontendBootMs: Math.round(performance.now()),
              bootPhases: bootPhasesRef.current,
            }).catch(() => {});
          } else {
            invoke("report_startup_ready", {
              visible: false,
              frontendBootMs: Math.round(performance.now()),
              bootPhases: bootPhasesRef.current,
            }).catch(() => {});
          }
          launchWindowPlacementDone.current = true;
          return;
        }

        const currentSize = await appWindow.innerSize();
        const monitorScale = await appWindow.scaleFactor();
        const currentH = currentSize.height / monitorScale;
        const currentW = currentSize.width / monitorScale;

        if (width < currentW || windowHeight < currentH) {
          const snapW = width >= currentW ? width : currentW;
          const snapH = windowHeight >= currentH ? windowHeight : currentH;

          if (snapW !== currentW || snapH !== currentH) {
            if (cancelled) return;
            await appWindow.setSize(new LogicalSize(snapW, snapH));
          }

          if (cancelled) return;
          root.style.width = `${width}px`;
          root.style.height = `${appHeight}px`;

          const changedProps: string[] = [];
          if (width !== currentW) changedProps.push("width");
          if (windowHeight !== currentH) changedProps.push("height");

          const completed = new Set<string>();
          transitionHandler = (e: TransitionEvent) => {
            if (e.target !== root) return;
            if (!changedProps.includes(e.propertyName)) return;
            completed.add(e.propertyName);
            if (completed.size >= changedProps.length) {
              root.removeEventListener("transitionend", transitionHandler!);
              if (resizeTimeout.current) {
                clearTimeout(resizeTimeout.current);
                resizeTimeout.current = null;
              }
              if (!cancelled) {
                appWindow
                  .setSize(new LogicalSize(width, windowHeight))
                  .catch((err) => {
                    logDiagnostic("App.resizeFinalize", {
                      error: String(err),
                    });
                  });
              }
            }
          };

          root.addEventListener("transitionend", transitionHandler);

          resizeTimeout.current = setTimeout(() => {
            if (transitionHandler) {
              root.removeEventListener("transitionend", transitionHandler);
            }
            if (!cancelled) {
              appWindow
                .setSize(new LogicalSize(width, windowHeight))
                .catch((err) => {
                  logDiagnostic("App.resizeFinalizeTimeout", {
                    error: String(err),
                  });
                });
            }
            resizeTimeout.current = null;
          }, 350);
        } else {
          if (cancelled) return;
          await appWindow.setSize(new LogicalSize(width, windowHeight));
          if (cancelled) return;
          root.style.width = `${currentW}px`;
          root.style.height = `${currentH}px`;

          void root.offsetHeight;

          root.style.width = `${width}px`;
          root.style.height = `${appHeight}px`;
        }
      } catch (err) {
        if (!cancelled) {
          logDiagnostic("App.sizeWindow", {
            error: String(err),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      if (transitionHandler) {
        root.removeEventListener("transitionend", transitionHandler);
      }
      if (resizeTimeout.current) {
        clearTimeout(resizeTimeout.current);
        resizeTimeout.current = null;
      }
    };
  }, [
    tab,
    updateInfo,
    dropdownOverflowBottom,
    settingsLoaded,
    settings.statusBarEnabled,
  ]);

  useEffect(() => {
    if (import.meta.env.DEV) return;

    const check = async () => {
      const result = await checkForUpdates();
      if (result?.updateAvailable) {
        setUpdateInfo({
          currentVersion: result.currentVersion,
          latestVersion: result.latestVersion,
        });
        setUpdateCheckStatus("available");
      }
    };

    check();
    const interval = setInterval(check, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleCheckForUpdate = async () => {
    setUpdateCheckStatus("checking");
    const result = await checkForUpdates();
    if (result) {
      if (result.updateAvailable) {
        setUpdateCheckStatus("available");
        setUpdateInfo({
          currentVersion: result.currentVersion,
          latestVersion: result.latestVersion,
        });
      } else {
        setUpdateCheckStatus("unavailable");
        setUpdateInfo(null);
      }
    } else {
      setUpdateCheckStatus("error");
      setUpdateInfo(null);
    }
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
    }
    cooldownTimerRef.current = setTimeout(() => {
      setUpdateCheckStatus((prev) => (prev === "available" ? prev : "idle"));
    }, 60000);
  };

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    document.documentElement.style.setProperty(
      "--font-family-base",
      `"${settings.fontFamily}", var(--font-fallback)`,
    );
  }, [settings.fontFamily]);

  useLayoutEffect(() => {
    document.documentElement.dataset.fancyTitle = settings.fancyTitle
      ? "true"
      : "false";
    document.documentElement.style.setProperty(
      "--title-font-family",
      `"${settings.titleFont}"`,
    );
  }, [settings.fancyTitle, settings.titleFont]);

  useEffect(() => {
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
  }, []);

  useEffect(() => {
    const cleanup = listen<boolean>("minimized-changed", (event) => {
      const root = document.querySelector(".app-root") as HTMLElement | null;
      if (!root) return;
      root.toggleAttribute("data-minimized", event.payload);
    });
    return () => {
      cleanup.then((fn) => fn());
    };
  }, []);

  const rawBackgroundPath = useMemo(() => {
    const sfx = tabSuffix(tab);
    const raw = resolvePerPage(
      settings,
      settings.backgroundImage,
      `backgroundImage${sfx}`,
    ) as string;
    return (raw ?? "").trim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.backgroundImage,
    settings.backgroundImageSimple,
    settings.backgroundImageAdvanced,
    settings.backgroundImageZones,
    settings.backgroundImageClickPoints,
    settings.backgroundImageSettings,
    settings.perPageAppearance,
    tab,
  ]);

  const [backgroundMedia, setBackgroundMedia] = useState<{
    kind: "none" | "image" | "video";
    cssUrl: string | null;
    videoSrc: string | null;
  }>({ kind: "none", cssUrl: null, videoSrc: null });

  useEffect(() => {
    let cancelled = false;

    const resolveMedia = async () => {
      const trimmed = rawBackgroundPath;
      if (!trimmed) {
        if (!cancelled) {
          setBackgroundMedia({ kind: "none", cssUrl: null, videoSrc: null });
        }
        return;
      }

      const lower = trimmed.toLowerCase();
      const isRemoteOrData =
        lower.startsWith("http://") ||
        lower.startsWith("https://") ||
        lower.startsWith("data:") ||
        lower.startsWith("asset://");

      let converted: string | null = null;
      if (!isRemoteOrData) {
        try {
          await invoke("allow_background_media", { path: trimmed });
          converted = convertFileSrc(trimmed);
        } catch (err) {
          logDiagnostic("App.backgroundMedia", { error: String(err) });
          converted = null;
        }
      }

      if (cancelled) return;

      const resolved = resolveBackgroundSource(trimmed, converted);
      if (resolved.kind === "image" && resolved.cssUrl) {
        setBackgroundMedia({
          kind: "image",
          cssUrl: resolved.cssUrl,
          videoSrc: null,
        });
        return;
      }
      if (resolved.kind === "video" && resolved.src) {
        setBackgroundMedia({
          kind: "video",
          cssUrl: null,
          videoSrc: resolved.src,
        });
        return;
      }
      setBackgroundMedia({ kind: "none", cssUrl: null, videoSrc: null });
    };

    void resolveMedia();

    return () => {
      cancelled = true;
    };
  }, [rawBackgroundPath]);

  useLayoutEffect(() => {
    const root = document.querySelector(".app-root") as HTMLElement | null;
    if (!root) return;
    if (backgroundMedia.kind === "image" && backgroundMedia.cssUrl) {
      root.style.setProperty("--bg-image", `url("${backgroundMedia.cssUrl}")`);
    } else {
      root.style.setProperty("--bg-image", "none");
    }
  }, [backgroundMedia]);

  useLayoutEffect(() => {
    const root = document.querySelector(".app-root") as HTMLElement | null;
    if (!root) return;

    const sfx = tabSuffix(tab);
    const bgOp = resolvePerPage(
      settings,
      settings.backgroundOpacity,
      `backgroundOpacity${sfx}`,
    );
    root.style.setProperty("--bg-opacity", String(bgOp));
  }, [settings, tab]);

  const handleTabChange = useCallback(
    (nextTab: Tab) => {
      setTab(nextTab);

      if (nextTab === "settings") return;
      if (committedSettingsRef.current.lastPanel === nextTab) return;

      updateSettings({
        lastPanel: nextTab,
      });
    },
    [updateSettings],
  );

  const handleResetSettings = async () => {
    try {
      if (hotkeyTimer.current !== null) {
        window.clearTimeout(hotkeyTimer.current);
        hotkeyTimer.current = null;
      }
      hotkeyRequestIdRef.current += 1;

      await invoke("reset_settings");
      await clearSavedSettings();
      await invoke("set_autostart_enabled", { enabled: false }).catch(() => {});
      const resetSettings = withFactoryPresets(DEFAULT_SETTINGS);
      await getCurrentWindow().setAlwaysOnTop(resetSettings.alwaysOnTop);

      lastValidHotkeyRef.current = resetSettings.hotkey;
      persistCommittedSettings(resetSettings, resetSettings);
      setTab("simple");
      launchWindowPlacementDone.current = false;
    } catch (err) {
      logDiagnostic("App.resetSettings", {
        error: String(err),
      });
    }
  };

  const handleGoToPresets = useCallback(() => {
    setSettingsInitialTab("presets");
    setTab("settings");
  }, []);

  const handleGoToVersionInfo = useCallback(() => {
    setSettingsInitialTab("general");
    setTab("settings");
  }, []);

  const handleInitialTabConsumed = useCallback(() => {
    setSettingsInitialTab(undefined);
  }, []);

  const handleTabChangeRef = useRef(handleTabChange);

  useEffect(() => {
    handleTabChangeRef.current = handleTabChange;
  }, [handleTabChange]);

  const keybindMapRef = useRef<Record<string, Tab>>({});

  useEffect(() => {
    const map: Record<string, Tab> = {};
    const add = (stored: string, tab: Tab) => {
      if (stored) map[stored] = tab;
    };
    add(settings.keybindSimple, "simple");
    add(settings.keybindAdvanced, "advanced");
    add(settings.keybindZones, "zones");
    add(settings.keybindClickPoints, "click-points");
    add(settings.keybindSettings, "settings");
    keybindMapRef.current = map;
  }, [
    settings.keybindSimple,
    settings.keybindAdvanced,
    settings.keybindZones,
    settings.keybindClickPoints,
    settings.keybindSettings,
  ]);

  useEffect(() => {
    const held: string[] = [];
    const normalizeKey = (e: KeyboardEvent): string | null => {
      const modifierHit = captureModifierHotkey(e);
      if (modifierHit) return modifierHit;
      if (e.key === "Escape" || e.code === "Escape") return "escape";
      if (e.key === "Backspace") return "backspace";
      if (e.key === "Delete") return "delete";
      const mainKey = getMainKey(e);
      if (mainKey) {
        if (held.length > 0) return buildHotkeyWithHeld(mainKey, held);
        const captured = captureHotkey(e);
        if (!captured) return null;
        return captured.split("+").pop() ?? captured;
      }
      const captured = captureHotkey(e);
      if (!captured) return null;
      return captured.split("+").pop() ?? captured;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const modifierHit = captureModifierHotkey(e);
      if (modifierHit && !held.includes(modifierHit)) held.push(modifierHit);
      if (e.repeat) return;
      if (
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable ||
          e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.tagName === "SELECT")
      ) {
        return;
      }
      const normalized = normalizeKey(e);
      if (!normalized) return;
      const tab = keybindMapRef.current[normalized];
      if (!tab) return;
      e.preventDefault();
      handleTabChangeRef.current(tab);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const modifierHit = captureModifierHotkey(e);
      if (modifierHit) {
        const idx = held.indexOf(modifierHit);
        if (idx !== -1) held.splice(idx, 1);
      }
    };
    const handleBlur = () => {
      held.length = 0;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  type ToggleHotkeyAction =
    | "mode"
    | "inputType"
    | "doubleClick"
    | "dutyCycleMode"
    | "speedRandomization"
    | "limits"
    | "cornerStop"
    | "edgeStop"
    | "stopZones"
    | "clickPoints"
    | "stopWhenComplete";

  const toggleHotkeyMapRef = useRef<Record<string, ToggleHotkeyAction>>({});

  useEffect(() => {
    const map: Record<string, ToggleHotkeyAction> = {};
    const add = (stored: string, action: ToggleHotkeyAction) => {
      if (stored) map[stored] = action;
    };
    add(settings.keybindMode, "mode");
    add(settings.keybindInputType, "inputType");
    add(settings.keybindDoubleClick, "doubleClick");
    add(settings.keybindDutyCycleMode, "dutyCycleMode");
    add(settings.keybindSpeedRandomization, "speedRandomization");
    add(settings.keybindLimits, "limits");
    add(settings.keybindCornerStop, "cornerStop");
    add(settings.keybindEdgeStop, "edgeStop");
    add(settings.keybindStopZones, "stopZones");
    add(settings.keybindToggleClickPoints, "clickPoints");
    add(settings.keybindStopWhenComplete, "stopWhenComplete");
    toggleHotkeyMapRef.current = map;
  }, [
    settings.keybindMode,
    settings.keybindInputType,
    settings.keybindDoubleClick,
    settings.keybindDutyCycleMode,
    settings.keybindSpeedRandomization,
    settings.keybindLimits,
    settings.keybindCornerStop,
    settings.keybindEdgeStop,
    settings.keybindStopZones,
    settings.keybindToggleClickPoints,
    settings.keybindStopWhenComplete,
  ]);

  const handleToggleHotkeyAction = useCallback(
    (action: ToggleHotkeyAction) => {
      const s = committedSettingsRef.current;
      switch (action) {
        case "mode":
          updateSettings({
            mode: s.mode === "Toggle" ? "Hold" : "Toggle",
          });
          break;
        case "inputType":
          updateSettings({
            inputType: s.inputType === "mouse" ? "keyboard" : "mouse",
          });
          break;
        case "doubleClick":
          updateSettings({
            doubleClickEnabled: !s.doubleClickEnabled,
          });
          break;
        case "dutyCycleMode":
          updateSettings(holdModePatch(s, s.dutyCycleMode !== "Hold"));
          break;
        case "speedRandomization":
          updateSettings({
            speedRandomizationEnabled: !s.speedRandomizationEnabled,
          });
          break;
        case "limits": {
          const effectiveMode: "clicks" | "time" =
            s.timeLimitEnabled !== s.clickLimitEnabled
              ? s.timeLimitEnabled
                ? "time"
                : "clicks"
              : "clicks";
          const isClicksMode = effectiveMode === "clicks";
          const activeEnabled = isClicksMode
            ? s.clickLimitEnabled
            : s.timeLimitEnabled;
          const nextValue = !activeEnabled;
          if (isClicksMode) {
            updateSettings({
              clickLimitEnabled: nextValue,
              timeLimitEnabled: false,
            });
          } else {
            updateSettings({
              timeLimitEnabled: nextValue,
              clickLimitEnabled: false,
            });
          }
          break;
        }
        case "cornerStop":
          updateSettings({
            cornerStopEnabled: !s.cornerStopEnabled,
          });
          break;
        case "edgeStop":
          updateSettings({
            edgeStopEnabled: !s.edgeStopEnabled,
          });
          break;
        case "stopZones":
          updateSettings({
            stopZonesEnabled: !s.stopZonesEnabled,
          });
          break;
        case "clickPoints":
          updateSettings({
            clickPointsEnabled: !s.clickPointsEnabled,
          });
          break;
        case "stopWhenComplete":
          updateSettings({
            stopWhenComplete: !s.stopWhenComplete,
          });
          break;
      }
    },
    [updateSettings],
  );

  useEffect(() => {
    const held: string[] = [];
    const handleKeyDown = (e: KeyboardEvent) => {
      const modifierHit = captureModifierHotkey(e);
      if (modifierHit && !held.includes(modifierHit)) held.push(modifierHit);
      if (e.repeat) return;
      if (
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable ||
          e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.tagName === "SELECT")
      ) {
        return;
      }

      const mainKey = getMainKey(e);
      const captured =
        mainKey && held.length > 0
          ? buildHotkeyWithHeld(mainKey, held)
          : (modifierHit ?? captureHotkey(e));
      if (!captured) return;

      const action = toggleHotkeyMapRef.current[captured];
      if (!action) return;

      e.preventDefault();
      handleToggleHotkeyAction(action);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const modifierHit = captureModifierHotkey(e);
      if (modifierHit) {
        const idx = held.indexOf(modifierHit);
        if (idx !== -1) held.splice(idx, 1);
      }
    };
    const handleBlur = () => {
      held.length = 0;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [handleToggleHotkeyAction]);

  useEffect(() => {
    invoke("register_master", {
      hotkey: settings.keybindMaster,
      holdMode: settings.masterKeybindMode === "hold",
    }).catch((err) => {
      logDiagnostic("App.registerMaster", {
        error: String(err),
      });
    });
  }, [settings.keybindMaster, settings.masterKeybindMode]);

  const activePreset = settings.presets.find(
    (p) => p.id === settings.activePresetId,
  );

  const elevationPromptOpen = status.elevationBlocked && !elevation.elevated;

  useEffect(() => {
    invoke<{ elevated: boolean; canElevate: boolean }>("get_elevation_state")
      .then((state) => {
        setElevation(state);
        setElevationLoaded(true);
      })
      .catch((err) => {
        logDiagnostic("App.elevationState", {
          error: String(err),
        });
        setElevationLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (!status.elevationBlocked || elevation.elevated) return;
    invoke("focus_main_window").catch(() => {});
  }, [status.elevationBlocked, elevation.elevated]);

  useEffect(() => {
    if (!settingsLoaded) return;
    invoke("set_elevation_notice_enabled", {
      enabled: settings.elevationNoticeEnabled,
    }).catch(() => {});
  }, [settingsLoaded, settings.elevationNoticeEnabled]);

  useEffect(() => {
    if (!settingsLoaded || !elevationLoaded) return;
    if (elevationRelaunchedRef.current) return;
    elevationRelaunchedRef.current = true;
    if (!settings.alwaysRunAsAdmin || elevation.elevated) return;
    if (!elevation.canElevate) return;
    invoke<boolean>("relaunch_as_admin")
      .then((relaunched) => {
        if (relaunched) return exit(0);
        return undefined;
      })
      .catch((err) =>
        logDiagnostic("App.relaunchAdmin", {
          error: String(err),
        }),
      );
  }, [settingsLoaded, elevationLoaded, settings.alwaysRunAsAdmin, elevation]);

  const flushPendingSettingsSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    try {
      await saveSettings(committedSettingsRef.current);
      return true;
    } catch (err) {
      logDiagnostic("App.flushSettings", {
        error: String(err),
      });
      return false;
    }
  }, []);

  const handleOpenCustomizer = useCallback(() => {
    void flushPendingSettingsSave().then((saved) => {
      if (!saved) {
        scheduleSaveRef.current(committedSettingsRef.current);
      }
      return invoke("open_theme_window").catch((err) =>
        logDiagnostic("App.openThemeWindow", {
          error: String(err),
        }),
      );
    });
  }, [flushPendingSettingsSave]);

  const readCommittedSettings = useCallback(
    () => committedSettingsRef.current,
    [],
  );

  const commitThemeSettings = useCallback((nextSettings: Settings) => {
    committedSettingsRef.current = nextSettings;
    setUiSettingsRef.current({
      ...nextSettings,
      hotkey: uiSettingsRef.current.hotkey,
    });
    scheduleSaveRef.current(nextSettings);
  }, []);

  const themeTabSuffix = tabSuffix(tab);

  useThemeRuntime({
    settings,
    settingsLoaded,
    windowOpacity:
      resolvePerPage(
        settings,
        settings.windowOpacity,
        `windowOpacity${themeTabSuffix}`,
      ) / 100,
    panelOpacity:
      resolvePerPage(
        settings,
        settings.panelOpacity,
        `panelOpacity${themeTabSuffix}`,
      ) / 100,
    panelBlur: resolvePerPage(
      settings,
      settings.panelBlur,
      `panelBlur${themeTabSuffix}`,
    ),
    backgroundBlur: resolvePerPage(
      settings,
      settings.backgroundBlur,
      `backgroundBlur${themeTabSuffix}`,
    ),
    readCommittedSettings,
    commitSettings: commitThemeSettings,
    openCustomizer: handleOpenCustomizer,
  });

  const handleRestartAsAdmin = useCallback(
    () => restartAsAdministrator(flushPendingSettingsSave),
    [flushPendingSettingsSave],
  );

  const handleElevationRestart = useCallback(async () => {
    setPromptBusy(true);
    try {
      const outcome = await handleRestartAsAdmin();
      if (outcome === "relaunched") return;
    } catch (err) {
      logDiagnostic("App.elevationRestart", {
        error: String(err),
      });
    }
    setPromptBusy(false);
  }, [handleRestartAsAdmin]);

  const handleAlwaysRunAsAdmin = useCallback(
    (next: boolean) => updateSettings({ alwaysRunAsAdmin: next }),
    [updateSettings],
  );

  const handleElevationDismiss = useCallback(() => {
    invoke("clear_elevation_blocked").catch(() => {});
  }, []);

  function computeTimeLimitMs(): number {
    if (!settings.timeLimitEnabled) return 0;
    const unit = settings.timeLimitUnit;
    const val = settings.timeLimit;
    switch (unit) {
      case "s":
        return val * 1000;
      case "m":
        return val * 60_000;
      case "h":
        return val * 3_600_000;
      default:
        return val * 1000;
    }
  }

  return (
    <div
      className="app-root"
      data-tab={tab}
      data-elevation-prompt={elevationPromptOpen}
    >
      {backgroundMedia.videoSrc && (
        <video
          key={backgroundMedia.videoSrc}
          className="app-bg-video"
          src={backgroundMedia.videoSrc}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
          onError={(e) => {
            const ext = getExtension(backgroundMedia.videoSrc ?? "");
            const legacy = isLegacyVideoExtension(ext);
            logDiagnostic("App.backgroundVideo", {
              error: `video load failed ext=${ext} legacy=${legacy}`,
            });
            // Hide broken video so UI not black; user can pick MP4/WebM instead
            const target = e.currentTarget as HTMLVideoElement;
            target.style.display = "none";
            target.pause();
          }}
          onLoadedData={(e) => {
            // Ensure hidden video from previous error becomes visible again when src changes
            (e.currentTarget as HTMLVideoElement).style.display = "";
          }}
        />
      )}
      <TitleBar
        tab={tab}
        setTab={handleTabChange}
        running={status.running}
        isAlwaysOnTop={settings.alwaysOnTop}
        onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
        onRequestClose={handleWindowClose}
        stopReason={status.stopReason}
        statusBarHidden={!settings.statusBarEnabled}
        masterOff={!status.masterAllowed}
      />
      {updateInfo && (
        <UpdateBanner
          key={`${updateInfo.currentVersion}:${updateInfo.latestVersion}`}
          currentVersion={updateInfo.currentVersion}
          latestVersion={updateInfo.latestVersion}
          portable={appInfo.portable}
        />
      )}
      <main className="panel-area" inert={elevationPromptOpen}>
        {tab === "simple" && (
          <SimplePanel settings={settings} update={updateSettings} />
        )}
        {tab === "advanced" && (
          <AdvancedPanel settings={settings} update={updateSettings} />
        )}
        {tab === "click-points" && (
          <ClickPointsPanel
            settings={settings}
            update={updateSettings}
            showInfo={true}
            running={status.running}
            activeClickPointIndex={status.activeClickPointIndex}
            activeClickPointTick={status.activeClickPointTick}
          />
        )}
        {tab === "zones" && (
          <ZonesPanel
            settings={settings}
            update={updateSettings}
            showInfo={true}
          />
        )}
        {tab === "settings" && (
          <SettingsPanel
            settings={settings}
            update={updateSettings}
            running={status.running}
            appInfo={appInfo}
            onSavePreset={handleSavePreset}
            onApplyPreset={handleApplyPreset}
            onUpdatePreset={handleUpdatePreset}
            onRenamePreset={handleRenamePreset}
            onDeletePreset={handleDeletePreset}
            onDuplicatePreset={handleDuplicatePreset}
            onExportPreset={handleExportPreset}
            onImportPreset={handleImportPreset}
            onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
            onRestartAsAdmin={handleRestartAsAdmin}
            onOpenCustomizer={handleOpenCustomizer}
            onReset={handleResetSettings}
            updateCheckStatus={updateCheckStatus}
            onCheckForUpdate={handleCheckForUpdate}
            initialSettingsTab={settingsInitialTab}
            onInitialTabConsumed={handleInitialTabConsumed}
          />
        )}
      </main>
      {settings.statusBarEnabled && (
        <StatusBar
          activePresetName={activePreset?.name ?? null}
          version={appInfo.version}
          stopReason={status.stopReason}
          warning={status.warning}
          running={status.running}
          paused={status.paused}
          clickCount={status.clickCount}
          activeClickPointIndex={status.activeClickPointIndex}
          totalClickPoints={settings.clickPoints.length}
          clickLimit={settings.clickLimit}
          clickLimitEnabled={settings.clickLimitEnabled}
          timeLimitMs={computeTimeLimitMs()}
          onGoToPresets={handleGoToPresets}
          onGoToVersionInfo={handleGoToVersionInfo}
        />
      )}
      <ElevationPrompt
        open={elevationPromptOpen}
        canElevate={elevation.canElevate}
        alwaysRunAsAdmin={settings.alwaysRunAsAdmin}
        windowName={status.elevationBlockedWindow?.name ?? ""}
        windowTitle={status.elevationBlockedWindow?.title ?? ""}
        busy={promptBusy}
        onRestart={handleElevationRestart}
        onAlwaysRunChange={handleAlwaysRunAsAdmin}
        onDismiss={handleElevationDismiss}
      />
    </div>
  );
}
