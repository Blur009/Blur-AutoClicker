import { useEffect, useRef, useState, lazy } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

const SimplePanel = lazy(() => import("./components/panels/SimplePanel"));
const AdvancedPanel = lazy(() => import("./components/panels/AdvancedPanel"));
const SettingsPanel = lazy(() => import("./components/panels/SettingsPanel"));
const TitleBar = lazy(() => import("./components/TitleBar"));
const AdvancedPanelCompact = lazy(
  () => import("./components/panels/AdvancedPanelCompact"),
);

import { canonicalizeHotkeyForBackend } from "./hotkeys";
import {
  DEFAULT_SETTINGS,
  type AppInfo,
  type ClickerStatus,
  type Settings,
  clearSavedSettings,
  loadSettings,
  saveSettings,
} from "./store";
import UpdateBanner from "./components/Updatebanner";

export type Tab = "simple" | "advanced" | "settings";

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
  version: "3.2.0",
  updateStatus: "La vérification des mises à jour est désactivée en développement",
  screenshotProtectionSupported: false,
};

async function syncSettingsToBackend(settings: Settings) {
  await invoke("update_settings", {
    settings: {
      ...settings,
      version: 5,
    },
  });
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
  const hotkeyTimer = useRef<number | null>(null);
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const launchWindowPlacementDone = useRef(false);

  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string;
    latestVersion: string;
  } | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistSettings = (nextSettings: Settings) => {
    settingsRef.current = nextSettings;
    setSettings(nextSettings);

    if (!settingsLoaded) return;

    syncSettingsToBackend(nextSettings).catch((err) => {
      console.error("Failed to sync settings:", err);
    });

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveSettings(nextSettings).catch((err) => {
        console.error("Failed to save settings:", err);
      });
    }, 100);
  };

  const updateSettings = (patch: Partial<Settings>) => {
    persistSettings({ ...settingsRef.current, ...patch });
  };

  const applyStartupWindowPlacement = async () => {
    await getCurrentWindow().center();
  };

  const handleWindowClose = async () => {
    await getCurrentWindow().close();
  };

  useEffect(() => {
    let mounted = true;

    Promise.all([
      loadSettings(),
      invoke<AppInfo>("get_app_info"),
      invoke<ClickerStatus>("get_status"),
    ])
      .then(async ([loadedSettings, loadedAppInfo, loadedStatus]) => {
        if (!mounted) return;

        const canonicalHotkey = await canonicalizeHotkeyForBackend(
          loadedSettings.hotkey,
        );
        const hydratedSettings =
          canonicalHotkey !== loadedSettings.hotkey
            ? { ...loadedSettings, hotkey: canonicalHotkey }
            : loadedSettings;

        settingsRef.current = hydratedSettings;
        setTab(hydratedSettings.lastPanel);
        setSettings(hydratedSettings);
        setAppInfo(loadedAppInfo);
        setStatus(loadedStatus);
        setSettingsLoaded(true);

        await syncSettingsToBackend(hydratedSettings);
        await invoke("register_hotkey", { hotkey: hydratedSettings.hotkey });

        if (canonicalHotkey !== loadedSettings.hotkey) {
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
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;

    if (hotkeyTimer.current !== null) {
      window.clearTimeout(hotkeyTimer.current);
    }

    hotkeyTimer.current = window.setTimeout(() => {
      canonicalizeHotkeyForBackend(settings.hotkey)
        .then((canonicalHotkey) =>
          invoke<string>("register_hotkey", { hotkey: canonicalHotkey }).then(
            (normalizedHotkey) => ({ canonicalHotkey, normalizedHotkey }),
          ),
        )
        .then(({ canonicalHotkey, normalizedHotkey }) => {
          const nextHotkey =
            normalizedHotkey !== settingsRef.current.hotkey
              ? normalizedHotkey
              : canonicalHotkey !== settingsRef.current.hotkey
                ? canonicalHotkey
                : null;

          if (nextHotkey) {
            persistSettings({ ...settingsRef.current, hotkey: nextHotkey });
          }
        })
        .catch((err) => {
          console.error("Failed to register hotkey:", err);
        });
    }, 250);

    return () => {
      if (hotkeyTimer.current !== null) {
        window.clearTimeout(hotkeyTimer.current);
      }
    };
  }, [settings.hotkey, settingsLoaded]);

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

  const resizeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

          root.offsetHeight;

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

  const handleTabChange = (nextTab: Tab) => {
    setTab(nextTab);

    if (nextTab === "settings") return;
    if (settingsRef.current.lastPanel === nextTab) return;

    persistSettings({
      ...settingsRef.current,
      lastPanel: nextTab,
    });
  };

  const handleResetSettings = async () => {
    try {
      const resetSettings = await invoke<Settings>("reset_settings");
      await clearSavedSettings();
      settingsRef.current = resetSettings;
      setSettings(resetSettings);
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
