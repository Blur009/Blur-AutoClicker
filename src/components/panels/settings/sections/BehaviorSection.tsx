import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { error } from "@tauri-apps/plugin-log";
import { DEFAULT_MAX_CLICK_SPEED } from "../../../../settingsSchema";
import type { Settings } from "../../../../store";
import { NumInput } from "../../advanced/sections/shared";
import ConfirmDialog from "../../../ConfirmDialog";
import { SettingsCard } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  onToggleAlwaysOnTop: () => Promise<void>;
}

export default function BehaviorSection({
  settings,
  update,
  onToggleAlwaysOnTop,
}: Props) {
  const [pendingAction, setPendingAction] = useState<
    "extended-click-speed-limit" | null
  >(null);
  const [autostartEnabled, setAutostartEnabled] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    invoke<boolean>("get_autostart_enabled")
      .then(setAutostartEnabled)
      .catch(() => setAutostartEnabled(false));
  }, []);

  const handleAlwaysOnTopChange = (nextValue: boolean) => {
    if (settings.alwaysOnTop === nextValue) return;
    void onToggleAlwaysOnTop();
  };

  const handleExtendedClickSpeedLimitChange = (nextValue: boolean) => {
    if (settings.extendedClickSpeedLimit === nextValue) return;
    if (nextValue) {
      setPendingAction("extended-click-speed-limit");
      return;
    }
    update({
      extendedClickSpeedLimit: false,
      clickSpeed: Math.min(settings.clickSpeed, DEFAULT_MAX_CLICK_SPEED),
    });
  };

  const handleConfirmExtendedClickSpeedLimit = () => {
    update({ extendedClickSpeedLimit: true });
    setPendingAction(null);
  };

  return (
    <>
      <SettingsCard
        title="Behavior"
        description="Change how the auto clicker runs."
      >
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Always on Top</span>
            <span className="settings-sublabel">
              Keep the window above others.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.alwaysOnTop ? "on" : "off"}`}
              onClick={() => handleAlwaysOnTopChange(!settings.alwaysOnTop)}
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Stop Hitbox Overlay</span>
            <span className="settings-sublabel">
              Show the stop zone boundaries.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.showStopOverlay ? "on" : "off"}`}
              onClick={() =>
                update({ showStopOverlay: !settings.showStopOverlay })
              }
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Stop Reason Alert</span>
            <span className="settings-sublabel">
              Show a notification when the auto clicker stops.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.showStopReason ? "on" : "off"}`}
              onClick={() =>
                update({ showStopReason: !settings.showStopReason })
              }
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Strict Hotkey Modifiers</span>
            <span className="settings-sublabel">
              Require exact modifier keys for hotkeys.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.strictHotkeyModifiers ? "on" : "off"}`}
              onClick={() =>
                update({
                  strictHotkeyModifiers: !settings.strictHotkeyModifiers,
                })
              }
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Stop on Alt+Tab</span>
            <span className="settings-sublabel">
              Stop clicking when switching to another window.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.taskSwitcherStopEnabled ? "on" : "off"}`}
              onClick={() =>
                update({
                  taskSwitcherStopEnabled: !settings.taskSwitcherStopEnabled,
                })
              }
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Extended Click Speed Limit</span>
            <span className="settings-sublabel">
              Allow click speeds up to 1000 CPS (may affect performance).
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.extendedClickSpeedLimit ? "on" : "off"}`}
              onClick={() =>
                handleExtendedClickSpeedLimitChange(
                  !settings.extendedClickSpeedLimit,
                )
              }
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Click Points Defaults"
        description="Default values for newly picked click points."
      >
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Default Clicks</span>
            <span className="settings-sublabel">
              Clicks per point for new entries.
            </span>
          </div>
          <div className="adv-numbox-sm" style={{ gap: "0.25rem" }}>
            <span
              className="adv-unit"
              style={{ minWidth: "0.75rem", textAlign: "left" }}
            >
              clicks
            </span>
            <NumInput
              hoverWheel={false}
              value={settings.newClickPointClicks}
              min={1}
              max={999999}
              onChange={(value) => update({ newClickPointClicks: value })}
              style={{ width: "7ch", textAlign: "right" }}
            />
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Default Radius</span>
            <span className="settings-sublabel">
              Randomization radius for new entries.
            </span>
          </div>
          <div className="adv-numbox-sm" style={{ gap: "0.25rem" }}>
            <span
              className="adv-unit"
              style={{ minWidth: "0.375rem", textAlign: "center" }}
            >
              r
            </span>
            <NumInput
              hoverWheel={false}
              value={settings.newClickPointRadius}
              min={0}
              max={9999}
              onChange={(value) => update({ newClickPointRadius: value })}
              style={{ width: "5ch", textAlign: "right" }}
            />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Startup" description="Behavior when the app opens.">
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Minimize to Tray</span>
            <span className="settings-sublabel">
              Minimize to the system tray instead of the taskbar.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.minimizeToTray ? "on" : "off"}`}
              onClick={() =>
                update({ minimizeToTray: !settings.minimizeToTray })
              }
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Remember Window Position</span>
            <span className="settings-sublabel">
              Open the window at its last position on startup.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.rememberWindowPosition ? "on" : "off"}`}
              onClick={() =>
                update({
                  rememberWindowPosition: !settings.rememberWindowPosition,
                })
              }
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Run on Startup</span>
            <span className="settings-sublabel">
              Start clicking when the app opens.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${autostartEnabled ? "on" : "off"}`}
              disabled={autostartEnabled === null}
              onClick={() => {
                const newValue = !autostartEnabled;
                invoke("set_autostart_enabled", { enabled: newValue })
                  .then(() => setAutostartEnabled(newValue))
                  .catch((err) =>
                    error(
                      JSON.stringify({
                        source: "SettingsPanel.setAutostart",
                        error: String(err),
                      }),
                    ),
                  );
              }}
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>
      </SettingsCard>

      <ConfirmDialog
        open={pendingAction === "extended-click-speed-limit"}
        title="Enable extended click speed limit?"
        message="This will allow click speeds beyond the default limit. This may affect performance."
        confirmLabel="Enable"
        onConfirm={handleConfirmExtendedClickSpeedLimit}
        onCancel={() => setPendingAction(null)}
      />
    </>
  );
}
