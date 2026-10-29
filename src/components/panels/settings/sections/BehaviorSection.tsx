import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { logDiagnostic } from "../../../../diagnostics";
import { DEFAULT_MAX_CLICK_SPEED } from "../../../../settingsSchema";
import type { Settings } from "../../../../store";
import type { RestartOutcome } from "../../../../restart";
import { NumInput } from "../../advanced/sections/shared";
import { ExtendedSpeedDialog, RestartAdminDialog } from "../settingsDialogs";
import { SettingsCard } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  onToggleAlwaysOnTop: () => Promise<void>;
  onRestartAsAdmin: () => Promise<RestartOutcome>;
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
  onRestartAsAdmin,
  portable,
}: Props) {
  const [pendingAction, setPendingAction] = useState<
    "extended-click-speed-limit" | "restart-as-admin" | null
  >(null);
  const [autostartEnabled, setAutostartEnabled] = useState<boolean | null>(
    null,
  );
  const [elevation, setElevation] = useState<{
    elevated: boolean;
    canElevate: boolean;
  } | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const [elevationFailed, setElevationFailed] = useState(false);

  useEffect(() => {
    invoke<boolean>("get_autostart_enabled")
      .then(setAutostartEnabled)
      .catch(() => setAutostartEnabled(false));
  }, []);

  useEffect(() => {
    invoke<{ elevated: boolean; canElevate: boolean }>("get_elevation_state")
      .then(setElevation)
      .catch((err) => {
        logDiagnostic("BehaviorSection.elevationState", {
          error: String(err),
        });
        setElevationFailed(true);
      });
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

  const handleAlwaysRunAsAdminToggle = useCallback(() => {
    const next = !settings.alwaysRunAsAdmin;
    setRestartError(null);
    update({ alwaysRunAsAdmin: next });
    if (next && elevation && !elevation.elevated && elevation.canElevate) {
      setPendingAction("restart-as-admin");
    }
  }, [update, settings.alwaysRunAsAdmin, elevation]);

  const handleConfirmRestartAsAdmin = useCallback(async () => {
    setRestarting(true);
    let outcome: RestartOutcome = "refused";
    try {
      outcome = await onRestartAsAdmin();
    } catch (err) {
      logDiagnostic("BehaviorSection.restartAsAdmin", {
        error: String(err),
      });
    }
    if (outcome === "unsaved") {
      setRestartError(
        "Could not save the setting. Nothing was restarted, so the next launch stays unelevated.",
      );
    } else if (outcome === "refused") {
      setRestartError(
        "Could not restart. It starts as administrator on the next launch.",
      );
    }
    setRestarting(false);
    setPendingAction(null);
  }, [onRestartAsAdmin]);

  const handleElevationNoticeToggle = useCallback(
    () => update({ elevationNoticeEnabled: !settings.elevationNoticeEnabled }),
    [update, settings.elevationNoticeEnabled],
  );

  const handleAutostartToggle = useCallback(() => {
    const newValue = !autostartEnabled;
    invoke("set_autostart_enabled", { enabled: newValue })
      .then(() => setAutostartEnabled(newValue))
      .catch((err) =>
        logDiagnostic("SettingsPanel.setAutostart", {
          error: String(err),
        }),
      );
  }, [autostartEnabled]);

  const elevationNote = () => {
    if (elevation === null) {
      return elevationFailed
        ? "Could not read administrator status. The setting still applies on the next launch."
        : "Checking administrator status…";
    }
    if (elevation.elevated) {
      return settings.alwaysRunAsAdmin
        ? "Running as administrator. Turn this off and reopen to drop the rights."
        : "Running as administrator now. Quit and reopen to drop the rights.";
    }
    if (restartError) return restartError;
    if (settings.alwaysRunAsAdmin) {
      return elevation.canElevate
        ? "Starts as administrator on the next launch."
        : "This account cannot elevate automatically. Start it as administrator from Windows.";
    }
    return "Not running as administrator.";
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
            <span className="settings-label">Stop Zone Overlay</span>
            <span className="settings-sublabel">
              Draw the stop zones on screen when they change.
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
              Hotkeys ignore presses with extra modifiers held.
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
              End the run when the task switcher opens.
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
              Raise the click speed limit from 500 to 1000.
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
        title="Click Point Defaults"
        description="Default values for newly picked click points."
      >
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Default Clicks</span>
            <span className="settings-sublabel">
              Clicks each new point starts with.
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
              How far new points scatter their clicks, in pixels.
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

      <SettingsCard
        title="Startup"
        description="How the app starts, and what closing it does."
      >
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Run as Administrator</span>
            <span className="settings-sublabel">
              Start as administrator so elevated windows accept clicks.
            </span>
            <span className="settings-note">{elevationNote()}</span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.alwaysRunAsAdmin ? "on" : "off"}`}
              disabled={elevation === null && !elevationFailed}
              onClick={handleAlwaysRunAsAdminToggle}
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Close to Tray</span>
            <span className="settings-sublabel">
              Hide the window to the tray instead of quitting.
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
              Reopen the window where you left it.
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
                Start with Windows, hidden in the tray.
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

      <SettingsCard title="Notices">
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Administrator Window Notice</span>
            <span className="settings-sublabel">
              Warn and offer a restart when an admin window takes focus.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.elevationNoticeEnabled ? "on" : "off"}`}
              onClick={handleElevationNoticeToggle}
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>
      </SettingsCard>

      <RestartAdminDialog
        open={pendingAction === "restart-as-admin"}
        busy={restarting}
        onConfirm={handleConfirmRestartAsAdmin}
        onCancel={handleCancelPending}
      />

      <ExtendedSpeedDialog
        open={pendingAction === "extended-click-speed-limit"}
        onConfirm={handleConfirmExtendedClickSpeedLimit}
        onCancel={handleCancelPending}
      />
    </>
  );
}
