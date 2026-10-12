import { useCallback, useEffect, useState, type CSSProperties } from "react";
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
  portable: boolean;
}

const UNIT_ROW_STYLE: CSSProperties = { gap: "0.25rem" };
const CLICKS_UNIT_STYLE: CSSProperties = {
  minWidth: "0.75rem",
  textAlign: "left",
};
const RADIUS_UNIT_STYLE: CSSProperties = {
  minWidth: "0.375rem",
  textAlign: "center",
};
const CLICKS_INPUT_STYLE: CSSProperties = {
  width: "7ch",
  textAlign: "right",
};
const RADIUS_INPUT_STYLE: CSSProperties = {
  width: "5ch",
  textAlign: "right",
};

export default function BehaviorSection({
  settings,
  update,
  onToggleAlwaysOnTop,
  portable,
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

  const handleAlwaysOnTopChange = useCallback(
    (nextValue: boolean) => {
      if (settings.alwaysOnTop === nextValue) return;
      void onToggleAlwaysOnTop();
    },
    [settings.alwaysOnTop, onToggleAlwaysOnTop],
  );

  const handleExtendedClickSpeedLimitChange = useCallback(
    (nextValue: boolean) => {
      if (settings.extendedClickSpeedLimit === nextValue) return;
      if (nextValue) {
        setPendingAction("extended-click-speed-limit");
        return;
      }
      update({
        extendedClickSpeedLimit: false,
        clickSpeed: Math.min(settings.clickSpeed, DEFAULT_MAX_CLICK_SPEED),
      });
    },
    [settings.extendedClickSpeedLimit, settings.clickSpeed, update],
  );

  const handleConfirmExtendedClickSpeedLimit = useCallback(() => {
    update({ extendedClickSpeedLimit: true });
    setPendingAction(null);
  }, [update]);

  const handleCancelPending = useCallback(() => setPendingAction(null), []);

  const handleShowStopOverlayToggle = useCallback(
    () => update({ showStopOverlay: !settings.showStopOverlay }),
    [update, settings.showStopOverlay],
  );

  const handleShowStopReasonToggle = useCallback(
    () => update({ showStopReason: !settings.showStopReason }),
    [update, settings.showStopReason],
  );

  const handleStrictHotkeyModifiersToggle = useCallback(
    () =>
      update({
        strictHotkeyModifiers: !settings.strictHotkeyModifiers,
      }),
    [update, settings.strictHotkeyModifiers],
  );

  const handleTaskSwitcherStopToggle = useCallback(
    () =>
      update({
        taskSwitcherStopEnabled: !settings.taskSwitcherStopEnabled,
      }),
    [update, settings.taskSwitcherStopEnabled],
  );

  const handleNewClickPointClicksChange = useCallback(
    (value: number) => update({ newClickPointClicks: value }),
    [update],
  );

  const handleNewClickPointRadiusChange = useCallback(
    (value: number) => update({ newClickPointRadius: value }),
    [update],
  );

  const handleMinimizeToTrayToggle = useCallback(
    () => update({ minimizeToTray: !settings.minimizeToTray }),
    [update, settings.minimizeToTray],
  );

  const handleRememberWindowPositionToggle = useCallback(
    () =>
      update({
        rememberWindowPosition: !settings.rememberWindowPosition,
      }),
    [update, settings.rememberWindowPosition],
  );

  const handleAutostartToggle = useCallback(() => {
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
  }, [autostartEnabled]);

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
              onClick={handleShowStopOverlayToggle}
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
              onClick={handleShowStopReasonToggle}
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
              onClick={handleStrictHotkeyModifiersToggle}
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
              onClick={handleTaskSwitcherStopToggle}
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
          <div className="adv-numbox-sm" style={UNIT_ROW_STYLE}>
            <span className="adv-unit" style={CLICKS_UNIT_STYLE}>
              clicks
            </span>
            <NumInput
              hoverWheel={false}
              value={settings.newClickPointClicks}
              min={1}
              max={999999}
              onChange={handleNewClickPointClicksChange}
              style={CLICKS_INPUT_STYLE}
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
          <div className="adv-numbox-sm" style={UNIT_ROW_STYLE}>
            <span className="adv-unit" style={RADIUS_UNIT_STYLE}>
              r
            </span>
            <NumInput
              hoverWheel={false}
              value={settings.newClickPointRadius}
              min={0}
              max={9999}
              onChange={handleNewClickPointRadiusChange}
              style={RADIUS_INPUT_STYLE}
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
              onClick={handleMinimizeToTrayToggle}
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
              onClick={handleRememberWindowPositionToggle}
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
                onClick={handleAutostartToggle}
              >
                <span className="settings-toggle-knob" />
              </button>
            </div>
          </div>
        )}
      </SettingsCard>

      <ConfirmDialog
        open={pendingAction === "extended-click-speed-limit"}
        title="Enable extended click speed limit?"
        message="This will allow click speeds beyond the default limit. This may affect performance."
        confirmLabel="Enable"
        onConfirm={handleConfirmExtendedClickSpeedLimit}
        onCancel={handleCancelPending}
      />
    </>
  );
}
