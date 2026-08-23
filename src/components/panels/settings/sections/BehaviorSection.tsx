import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { error } from "@tauri-apps/plugin-log";
import type { Settings } from "../../../../store";
import { NumInput } from "../../advanced/sections/shared";
import { SettingsCard } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  onToggleAlwaysOnTop: () => Promise<void>;
  portable: boolean;
}

export default function BehaviorSection({
  settings,
  update,
  onToggleAlwaysOnTop,
  portable,
}: Props) {
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

        {!portable && (
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
        )}
      </SettingsCard>
    </>
  );
}
