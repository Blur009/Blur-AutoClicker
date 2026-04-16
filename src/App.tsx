import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { lazy, useEffect, useRef, useState } from "react";
import UpdateBanner from "./components/Updatebanner";
import { canonicalizeHotkeyForBackend } from "./hotkeys";
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

const SimplePanel = lazy(() => import("./components/panels/SimplePanel"));
const AdvancedPanel = lazy(() => import("./components/panels/AdvancedPanel"));
const SettingsPanel = lazy(() => import("./components/panels/SettingsPanel"));
const TitleBar = lazy(() => import("./components/TitleBar"));
const AdvancedPanelCompact = lazy(
  () => import("./components/panels/AdvancedPanelCompact"),
);

export type Tab = "simple" | "advanced" | "settings";

const BACKEND_SETTINGS_SCHEMA_VERSION = 5;

function getPanelSize(tab: Tab, settings: Settings, hasUpdate: boolean) {
  const extra = hasUpdate ? 30 : 0;
  if (tab === "settings") return { width: 500, height: 600 + extra };
  if (tab === "simple") return { width: 550, height: 175 + extra };
  return settings.explanationMode === "off"
    ? { width: 600, height: 600 + extra }
    : { width: 800, height: 650 + extra };
}

const DEFAULT_STATUS: ClickerStatus = {
  running: false,
  clickCount: 0,
  lastError: null,
  stopReason: null,
};

const DEFAULT_APP_INFO: AppInfo = {
  version: APP_VERSION,
  updateStatus: "Update checks are disabled in development",
  screenshotProtectionSupported: false,
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

export default function App() {
  const [tab, setTab] = useState<Tab>("simple");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [status, setStatus] = useState<ClickerStatus>(DEFAULT_STATUS);
  const [appInfo, setAppInfo] = useState<AppInfo>(DEFAULT_APP_INFO);
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string;
    latestVersion: string;
  } | null>(null);

  const hotkeyTimer = useRef<number | null>(null);
  const hotkeyRequestIdRef = useRef(0);
  const uiSettingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const committedSettingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const lastValidHotkeyRef = useRef(DEFAULT_SETTINGS.hotkey);
  const launchWindowPlacementDone = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          restoreLastValidHotkey();
        });
    }, 250);
  };

  const updateSettings = (patch: Partial<Settings>) => {
    const { hotkey, ...rest } = patch;

    if (Object.keys(rest).length > 0) {
      const nextUiSettings = { ...uiSettingsRef.current, ...rest };
      const nextCommittedSettings = { ...committedSettingsRef.current, ...rest };
      persistCommittedSettings(nextCommittedSettings, nextUiSettings);
    }

    if (hotkey !== undefined) {
      setUiSettings({
        ...uiSettingsRef.current,
        hotkey,
      });
      queueHotkeyRegistration(hotkey);
    }
  };

  const applyStartupWindowPlacement = async () => {
    await getCurrentWindow().center();
  };

  const handleWindowClose = async () => {
    await getCurrentWindow().close();
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

        let registeredHotkey = loadedSettings.hotkey;
        try {
          registeredHotkey = await registerHotkeyCandidate(loadedSettings.hotkey);
        } catch (err) {
          console.error("Failed to register saved hotkey:", err);
          registeredHotkey = lastValidHotkeyRef.current;
        }

        const hydratedSettings =
          registeredHotkey !== loadedSettings.hotkey
            ? { ...loadedSettings, hotkey: registeredHotkey }
            : loadedSettings;

        lastValidHotkeyRef.current = hydratedSettings.hotkey;
        uiSettingsRef.current = hydratedSettings;
        committedSettingsRef.current = hydratedSettings;

        setTab(hydratedSettings.lastPanel);
        setSettings(hydratedSettings);
        setAppInfo(loadedAppInfo);
        setStatus(loadedStatus);
        setSettingsLoaded(true);

        await syncSettingsToBackend(hydratedSettings);

        if (hydratedSettings.hotkey !== loadedSettings.hotkey) {
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
    if (resizeTimeout.current) {
      clearTimeout(resizeTimeout.current);
      resizeTimeout.current = null;
    }

    const { width, height } = getPanelSize(tab, settings, !!updateInfo);
    const root = document.querySelector(".app-root") as HTMLElement;

    void (async () => {
      try {
        if (!launchWindowPlacementDone.current) {
          const appWindow = getCurrentWindow();
          await appWindow.setSize(new LogicalSize(width, height));
          root.style.width = `${width}px`;
          root.style.height = `${height}px`;
          await wait(30);
          await applyStartupWindowPlacement();
          launchWindowPlacementDone.current = true;
          return;
        }

        const appWindow = getCurrentWindow();
        const currentSize = await appWindow.innerSize();
        const scale = await appWindow.scaleFactor();
        const currentH = currentSize.height / scale;
        const currentW = currentSize.width / scale;

        if (width < currentW || height < currentH) {
          const snapW = width >= currentW ? width : currentW;
          const snapH = height >= currentH ? height : currentH;

          if (snapW !== currentW || snapH !== currentH) {
            await appWindow.setSize(new LogicalSize(snapW, snapH));
          }

          root.style.width = `${width}px`;
          root.style.height = `${height}px`;

          resizeTimeout.current = setTimeout(async () => {
            await appWindow.setSize(new LogicalSize(width, height));
            resizeTimeout.current = null;
          }, 320);
        } else {
          await appWindow.setSize(new LogicalSize(width, height));
          root.style.width = `${currentW}px`;
          root.style.height = `${currentH}px`;

          void root.offsetHeight;

          root.style.width = `${width}px`;
          root.style.height = `${height}px`;
        }
      } catch (err) {
        console.error("Failed to size window:", err);
      }
    })();
  }, [settings, settingsLoaded, tab, updateInfo]);

  useEffect(() => {
    const checkForUpdates = () => {
      invoke<{
        currentVersion: string;
        latestVersion: string;
        updateAvailable: boolean;
      }>("check_for_updates")
        .then((result) => {
          if (result?.updateAvailable) {
            setUpdateInfo({
              currentVersion: result.currentVersion,
              latestVersion: result.latestVersion,
            });
          }
        })
        .catch((err) => console.error("Update check failed:", err));
    };

    checkForUpdates();
    const interval = setInterval(checkForUpdates, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme ?? "dark";
  }, [settings.theme]);

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

  const handlePickPosition = async () => {
    try {
      const point = await invoke<{ x: number; y: number }>("pick_position");
      updateSettings({
        positionEnabled: true,
        positionX: point.x,
        positionY: point.y,
      });
    } catch (err) {
      console.error("Failed to pick position:", err);
    }
  };

  return (
    <div className="app-root" data-tab={tab}>
      <TitleBar
        tab={tab}
        setTab={handleTabChange}
        running={status.running}
        stopReason={
          settings.showStopReason && tab === "advanced"
            ? status.stopReason
            : null
        }
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
        {tab === "simple" && (
          <SimplePanel settings={settings} update={updateSettings} />
        )}
        {tab === "advanced" &&
          (settings.explanationMode === "off" ? (
            <AdvancedPanelCompact
              settings={settings}
              update={updateSettings}
              onPickPosition={handlePickPosition}
            />
          ) : (
            <AdvancedPanel
              settings={settings}
              update={updateSettings}
              onPickPosition={handlePickPosition}
            />
          ))}
        {tab === "settings" && (
          <SettingsPanel
            settings={settings}
            update={updateSettings}
            appInfo={appInfo}
            onReset={handleResetSettings}
          />
        )}
      </main>
    </div>
  );
}
