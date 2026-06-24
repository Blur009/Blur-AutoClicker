import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  currentMonitor,
  getCurrentWindow,
  LogicalSize,
} from "@tauri-apps/api/window";
import {
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { applyAccentTheme } from "./accentTheme";
import TimerWidget from "./components/TimerWidget";
import UpdateBanner from "./components/Updatebanner";
import { canonicalizeHotkeyForBackend } from "./hotkeys";

import {
  buildPresetSnapshot,
  createPresetDefinition,
  MAX_PRESETS,
  sanitizeSettings,
  sanitizePresetName,
  type PresetId,
} from "./settingsSchema";
import {
  APP_VERSION,
  DEFAULT_SETTINGS,
  type AppInfo,
  type ClickerStatus,
  type Settings,
  clearSavedSettings,
  loadSettings,
  saveSettings,
} from "./store";
import { timeLimitDurationMs, timeLimitStopReason } from "./timerUtils";

const SimplePanel = lazy(() => import("./components/panels/SimplePanel"));
const AdvancedPanel = lazy(
  () => import("./components/panels/advanced/AdvancedPanel"),
);
const ZonesPanel = lazy(() => import("./components/panels/zones/ZonesPanel"));
const SettingsPanel = lazy(() => import("./components/panels/SettingsPanel"));
const TitleBar = lazy(() => import("./components/TitleBar"));
export type Tab = "simple" | "advanced" | "zones" | "settings";

const BACKEND_SETTINGS_SCHEMA_VERSION = 10;
const MAX_DROPDOWN_OVERFLOW_BOTTOM = 220;
const OPERATIONAL_SETTING_KEYS = new Set<string>(
  Object.keys(buildPresetSnapshot(DEFAULT_SETTINGS)),
);

type DropdownOverflowDetail = {
  active: boolean;
  bottom?: number;
};

function getPanelSize(
  tab: Tab,
  hasUpdate: boolean,
  advancedSequenceLayout: Settings["advancedSequenceLayout"],
  showTimerWidget: boolean,
) {
  const extra = hasUpdate ? 30 : 0;
  const timerExtra = tab !== "settings" && showTimerWidget ? 74 : 0;
  if (tab === "simple") {
    return { width: 650, height: 175 + extra + timerExtra };
  }
  if (tab === "settings") return { width: 560, height: 720 + extra };
  if (tab === "zones") return { width: 750, height: 720 + extra + timerExtra };
  if (advancedSequenceLayout === "tall") {
    return { width: 560, height: 720 + extra + timerExtra };
  }
  return { width: 912, height: 527 + extra + timerExtra };
}

const textScale = await invoke<number>("get_text_scale_factor");
await invoke("set_webview_zoom", { factor: 1.0 / textScale });

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

const DEFAULT_STATUS: ClickerStatus = {
  running: false,
  paused: false,
  clickCount: 0,
  lastError: null,
  stopReason: null,
  warning: null,
  activeSequenceIndex: null,
  activeSequenceTick: 0,
  sessionStartedAtMs: null,
  lastSessionDurationMs: 0,
};

const DEFAULT_APP_INFO: AppInfo = {
  version: APP_VERSION,
  updateStatus: "Update checks are disabled in development",
  screenshotProtectionSupported: false,
};

type UpdateSettingsOptions = {
  preserveActivePreset?: boolean;
};

type StopwatchState = {
  elapsedMs: number;
  startedAtMs: number | null;
  running: boolean;
};

const DEFAULT_STOPWATCH_STATE: StopwatchState = {
  elapsedMs: 0,
  startedAtMs: null,
  running: false,
};

async function syncSettingsToBackend(settings: Settings) {
  await invoke("update_settings", {
    settings: {
      ...settings,
      version: BACKEND_SETTINGS_SCHEMA_VERSION,
    },
  });
}

async function registerHotkeyCandidate(hotkey: string) {
  const canonicalHotkey = await canonicalizeHotkeyForBackend(hotkey);
  return invoke<string>("register_hotkey", { hotkey: canonicalHotkey });
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
    console.error("Update check failed:", err);
    return null;
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>("simple");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [status, setStatus] = useState<ClickerStatus>(DEFAULT_STATUS);
  const [stopwatch, setStopwatch] = useState<StopwatchState>(
    DEFAULT_STOPWATCH_STATE,
  );
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());
  const [appInfo, setAppInfo] = useState<AppInfo>(DEFAULT_APP_INFO);
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string;
    latestVersion: string;
  } | null>(null);
  const [updateCheckStatus, setUpdateCheckStatus] = useState<
    "idle" | "checking" | "available" | "unavailable" | "error"
  >("idle");
  const [dropdownOverflowBottom, setDropdownOverflowBottom] = useState(0);

  const hotkeyTimer = useRef<number | null>(null);
  const hotkeyRequestIdRef = useRef(0);
  const uiSettingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const committedSettingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const lastValidHotkeyRef = useRef(DEFAULT_SETTINGS.hotkey);
  const launchWindowPlacementDone = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);
  const previousRunningRef = useRef(false);
  const pendingLastSessionDurationRef = useRef<number | null>(null);

  const setUiSettings = (nextSettings: Settings) => {
    uiSettingsRef.current = nextSettings;
    setSettings(nextSettings);
  };

  const scheduleSave = (nextSettings: Settings) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveSettings(nextSettings).catch((err) => {
        console.error("Failed to save settings:", err);
      });
    }, 100);
  };

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
      console.error("Failed to sync settings:", err);
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

          console.error("Failed to register hotkey:", err);

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
  });

  const updateSettings = useCallback(
    (patch: Partial<Settings>, options: UpdateSettingsOptions = {}) => {
      const { hotkey, ...rest } = patch;
      const shouldClearActivePreset =
        !options.preserveActivePreset &&
        (hotkey !== undefined ||
          Object.keys(rest).some((key) => OPERATIONAL_SETTING_KEYS.has(key)));

      const restPatch: Partial<Settings> = { ...rest };
      if (
        shouldClearActivePreset &&
        patch.activePresetId === undefined &&
        committedSettingsRef.current.activePresetId !== null
      ) {
        restPatch.activePresetId = null;
      }

      if (Object.keys(restPatch).length > 0) {
        const nextUiSettings = sanitizeSettings(
          { ...uiSettingsRef.current, ...restPatch },
          APP_VERSION,
        );
        const nextCommittedSettings = sanitizeSettings(
          { ...committedSettingsRef.current, ...restPatch },
          APP_VERSION,
        );

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
    },
    [],
  );

  const handleStopwatchToggle = useCallback(() => {
    const now = Date.now();
    setClockNowMs(now);
    setStopwatch((current) => {
      if (current.running) {
        const elapsedFromRun = current.startedAtMs
          ? now - current.startedAtMs
          : 0;
        return {
          elapsedMs: current.elapsedMs + elapsedFromRun,
          startedAtMs: null,
          running: false,
        };
      }

      return {
        ...current,
        startedAtMs: now,
        running: true,
      };
    });
  }, []);

  const handleStopwatchReset = useCallback(() => {
    setClockNowMs(Date.now());
    setStopwatch(DEFAULT_STOPWATCH_STATE);
  }, []);

  const applyStartupWindowPlacement = async () => {
    await getCurrentWindow().center();
  };

  const handleWindowClose = async () => {
    if (uiSettingsRef.current.minimizeToTray) {
      await invoke("hide_main_window");
    } else {
      await invoke("quit_app");
    }
  };

  const handleToggleAlwaysOnTop = async () => {
    const nextValue = !committedSettingsRef.current.alwaysOnTop;

    try {
      await getCurrentWindow().setAlwaysOnTop(nextValue);
      updateSettings(
        {
          alwaysOnTop: nextValue,
        },
        { preserveActivePreset: true },
      );
    } catch (err) {
      console.error("Failed to set always on top:", err);
    }
  };

  const handleSavePreset = (name: string) => {
    if (status.running) {
      return false;
    }

    if (committedSettingsRef.current.presets.length >= MAX_PRESETS) {
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

    updateSettings(
      {
        ...preset.settings,
        activePresetId: presetId,
      },
      { preserveActivePreset: true },
    );
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

  useEffect(() => {
    let mounted = true;

    void Promise.all([
      loadSettings(),
      invoke<AppInfo>("get_app_info"),
      invoke<ClickerStatus>("get_status"),
    ])
      .then(async ([loadedSettings, loadedAppInfo, loadedStatus]) => {
        if (!mounted) return;

        let hydratedSettings = loadedSettings;

        let registeredHotkey = loadedSettings.hotkey;
        try {
          registeredHotkey = await registerHotkeyCandidate(
            loadedSettings.hotkey,
          );
        } catch (err) {
          console.error("Failed to register saved hotkey:", err);
          registeredHotkey = lastValidHotkeyRef.current;
        }

        if (registeredHotkey !== hydratedSettings.hotkey) {
          hydratedSettings = {
            ...hydratedSettings,
            hotkey: registeredHotkey,
          };
        }

        try {
          await getCurrentWindow().setAlwaysOnTop(hydratedSettings.alwaysOnTop);
        } catch (err) {
          console.error("Failed to restore always on top:", err);
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
        setSettingsLoaded(true);

        await syncSettingsToBackend(hydratedSettings);

        if (
          hydratedSettings.hotkey !== loadedSettings.hotkey ||
          hydratedSettings.alwaysOnTop !== loadedSettings.alwaysOnTop
        ) {
          await saveSettings(hydratedSettings);
        }
      })
      .catch((err) => {
        console.error("Failed to boot app:", err);
        if (!mounted) return;
        setSettingsLoaded(true);
      });

    return () => {
      mounted = false;
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
    })
      .then((unlisten) => {
        cleanup = unlisten;
      })
      .catch((err) => {
        console.error("Failed to listen for clicker status:", err);
      });

    return () => {
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    if (!status.running && !stopwatch.running) {
      return;
    }

    const refreshClock = () => setClockNowMs(Date.now());
    refreshClock();
    const interval = window.setInterval(refreshClock, 1000);

    return () => window.clearInterval(interval);
  }, [status.running, stopwatch.running]);

  useEffect(() => {
    const saveLastSessionDuration = (durationMs: number) => {
      if (
        durationMs > 0 &&
        committedSettingsRef.current.lastSessionDurationMs !== durationMs
      ) {
        updateSettings(
          { lastSessionDurationMs: durationMs },
          { preserveActivePreset: true },
        );
      }
    };

    if (status.running && status.sessionStartedAtMs) {
      sessionStartedAtRef.current = status.sessionStartedAtMs;
    }

    if (previousRunningRef.current && !status.running) {
      const fallbackDurationMs = sessionStartedAtRef.current
        ? Date.now() - sessionStartedAtRef.current
        : 0;
      const durationMs = Math.max(
        0,
        Math.round(status.lastSessionDurationMs || fallbackDurationMs),
      );

      if (settingsLoaded) {
        saveLastSessionDuration(durationMs);
      } else {
        pendingLastSessionDurationRef.current = durationMs;
      }

      sessionStartedAtRef.current = null;
    }

    if (
      settingsLoaded &&
      !status.running &&
      pendingLastSessionDurationRef.current !== null
    ) {
      saveLastSessionDuration(pendingLastSessionDurationRef.current);
      pendingLastSessionDurationRef.current = null;
    }

    previousRunningRef.current = status.running;
  }, [settingsLoaded, status, updateSettings]);

  useEffect(() => {
    if (
      !settings.timeLimitEnabled ||
      !status.running ||
      !status.sessionStartedAtMs
    ) {
      return;
    }

    const durationMs = timeLimitDurationMs(settings);
    if (durationMs <= 0) {
      return;
    }

    const stopAtMs = status.sessionStartedAtMs + durationMs;
    const stop = () => {
      invoke<ClickerStatus>("stop_clicker_with_reason", {
        reason: timeLimitStopReason(durationMs),
      })
        .then(setStatus)
        .catch((err) => {
          console.error("Failed to stop clicker after countdown:", err);
        });
    };

    const remainingMs = stopAtMs - Date.now();
    if (remainingMs <= 0) {
      stop();
      return;
    }

    const timeout = window.setTimeout(
      stop,
      Math.min(remainingMs, 2_147_483_647),
    );

    return () => window.clearTimeout(timeout);
  }, [settings, status.running, status.sessionStartedAtMs]);

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
        const textScale = await invoke<number>("get_text_scale_factor");
        document.documentElement.style.fontSize = `${16 * textScale}px`;

        const preferredSize = getPanelSize(
          tab,
          !!updateInfo,
          settings.advancedSequenceLayout,
          settings.showStopwatchOnMainWindow,
        );
        const { width, height } = await getClampedPanelSize(
          preferredSize,
          textScale,
        );
        const windowHeight = height + dropdownOverflowBottom;

        const appWindow = getCurrentWindow();

        if (!launchWindowPlacementDone.current) {
          if (cancelled) return;
          await appWindow.setSize(new LogicalSize(width, windowHeight));

          if (cancelled) return;
          root.style.width = `${width}px`;
          root.style.height = `${height}px`;

          await wait(30);
          if (cancelled) return;
          await applyStartupWindowPlacement();
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
          root.style.height = `${height}px`;

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
                    console.error("Failed to finalize window resize:", err);
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
                  console.error("Failed to finalize window resize:", err);
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
          root.style.height = `${height}px`;
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to size window:", err);
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
    settings.advancedSequenceLayout,
    settings.showStopwatchOnMainWindow,
  ]);

  useEffect(() => {
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

  useEffect(() => {
    const theme = settings.theme ?? "dark";
    document.documentElement.dataset.theme = theme;
    applyAccentTheme(settings.accentColor, theme);
  }, [settings.accentColor, settings.theme]);

  useEffect(() => {
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
  }, []);

  useEffect(() => {
    const root = document.querySelector(".app-root") as HTMLElement | null;
    if (!root) return;

    const panelOpacity = settings.panelOpacity / 100;
    const colors =
      settings.theme === "light"
        ? {
            surface: "255, 255, 255",
            elevated: "242, 242, 242",
            input: "217, 217, 217",
            inputOff: "217, 217, 217",
          }
        : {
            surface: "26, 26, 26",
            elevated: "38, 38, 38",
            input: "59, 59, 59",
            inputOff: "51, 51, 51",
          };

    root.style.setProperty(
      "--bg-surface",
      `rgba(${colors.surface}, ${panelOpacity})`,
    );
    root.style.setProperty(
      "--bg-elevated",
      `rgba(${colors.elevated}, ${panelOpacity})`,
    );
    root.style.setProperty(
      "--bg-input",
      `rgba(${colors.input}, ${panelOpacity})`,
    );
    root.style.setProperty(
      "--bg-input-off",
      `rgba(${colors.inputOff}, ${panelOpacity})`,
    );
    root.style.setProperty("--bg-panel-blur", `${settings.panelBlur}px`);

    return () => {
      root.style.removeProperty("--bg-surface");
      root.style.removeProperty("--bg-elevated");
      root.style.removeProperty("--bg-input");
      root.style.removeProperty("--bg-input-off");
      root.style.removeProperty("--bg-panel-blur");
    };
  }, [settings.panelOpacity, settings.panelBlur, settings.theme]);

  useEffect(() => {
    const root = document.querySelector(".app-root") as HTMLElement | null;
    if (!root) return;

    const img = settings.backgroundImage;
    const escape = (s: string) => s.replace(/"/g, '\\"');

    if (!img) {
      root.style.setProperty("--bg-image", "none");
    } else if (
      img.startsWith("http://") ||
      img.startsWith("https://") ||
      img.startsWith("data:")
    ) {
      root.style.setProperty("--bg-image", `url("${escape(img)}")`);
    } else {
      root.style.setProperty(
        "--bg-image",
        `url("${escape(convertFileSrc(img))}")`,
      );
    }
  }, [settings.backgroundImage]);

  useEffect(() => {
    const root = document.querySelector(".app-root") as HTMLElement | null;
    if (!root) return;
    root.style.setProperty("--bg-opacity", String(settings.backgroundOpacity));
  }, [settings.backgroundOpacity]);

  const handleTabChange = (nextTab: Tab) => {
    setTab(nextTab);

    if (nextTab === "settings") return;
    if (committedSettingsRef.current.lastPanel === nextTab) return;

    updateSettings({
      lastPanel: nextTab,
    });
  };

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
      await getCurrentWindow().setAlwaysOnTop(DEFAULT_SETTINGS.alwaysOnTop);

      lastValidHotkeyRef.current = DEFAULT_SETTINGS.hotkey;
      committedSettingsRef.current = DEFAULT_SETTINGS;
      uiSettingsRef.current = DEFAULT_SETTINGS;

      setSettings(DEFAULT_SETTINGS);
      setTab("simple");
      launchWindowPlacementDone.current = false;
    } catch (err) {
      console.error("Failed to reset settings:", err);
    }
  };

  const [stopKey, setStopKey] = useState(0);
  const prevStopReasonRef = useRef(status.stopReason);
  if (status.stopReason && status.stopReason !== prevStopReasonRef.current) {
    prevStopReasonRef.current = status.stopReason;
    setStopKey((k) => k + 1);
  }

  const sessionElapsedMs =
    status.running && status.sessionStartedAtMs
      ? Math.max(0, clockNowMs - status.sessionStartedAtMs)
      : 0;
  const stopwatchElapsedMs =
    stopwatch.elapsedMs +
    (stopwatch.running && stopwatch.startedAtMs
      ? Math.max(0, clockNowMs - stopwatch.startedAtMs)
      : 0);
  const lastSessionDurationMs =
    !status.running && status.lastSessionDurationMs > 0
      ? status.lastSessionDurationMs
      : settings.lastSessionDurationMs;
  const showTimerWidget =
    settings.showStopwatchOnMainWindow && tab !== "settings";

  return (
    <div className="app-root" data-tab={tab}>
      <TitleBar
        tab={tab}
        setTab={handleTabChange}
        running={status.running}
        paused={status.paused}
        stopReason={
          settings.showStopReason &&
          (tab === "simple" || tab === "advanced" || tab === "zones")
            ? status.stopReason
            : null
        }
        stopKey={stopKey}
        warning={status.warning}
        isAlwaysOnTop={settings.alwaysOnTop}
        onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
        onRequestClose={handleWindowClose}
      />
      {updateInfo && (
        <UpdateBanner
          key={`${updateInfo.currentVersion}:${updateInfo.latestVersion}`}
          currentVersion={updateInfo.currentVersion}
          latestVersion={updateInfo.latestVersion}
        />
      )}
      <main className="panel-area">
        {showTimerWidget && (
          <TimerWidget
            settings={settings}
            update={updateSettings}
            running={status.running}
            paused={status.paused}
            sessionElapsedMs={sessionElapsedMs}
            lastSessionDurationMs={lastSessionDurationMs}
            stopwatchElapsedMs={stopwatchElapsedMs}
            stopwatchRunning={stopwatch.running}
            onStopwatchToggle={handleStopwatchToggle}
            onStopwatchReset={handleStopwatchReset}
          />
        )}
        {tab === "simple" && (
          <SimplePanel settings={settings} update={updateSettings} />
        )}
        {tab === "advanced" && (
          <AdvancedPanel
            settings={settings}
            update={updateSettings}
            showInfo={true}
            running={status.running}
            activeSequenceIndex={status.activeSequenceIndex}
            activeSequenceTick={status.activeSequenceTick}
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
            onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
            onReset={handleResetSettings}
            updateCheckStatus={updateCheckStatus}
            onCheckForUpdate={handleCheckForUpdate}
          />
        )}
      </main>
    </div>
  );
}
