import "./SettingsPanel.css";
import type {
  AppInfo,
  PresetDefinition,
  PresetId,
  Settings,
} from "../../store";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import ConfirmDialog from "../ConfirmDialog";

type PendingAction = "reset-settings" | "clear-stats" | null;
import {
  DEFAULT_ACCENT_COLOR,
  MAX_PRESETS,
  PRESET_NAME_MAX_LENGTH,
} from "../../settingsSchema";

interface CumulativeStats {
  totalClicks: number;
  totalTimeSecs: number;
  totalSessions: number;
  avgCpu: number;
}

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  running: boolean;
  appInfo: AppInfo;
  onSavePreset: (name: string) => boolean;
  onApplyPreset: (presetId: PresetId) => boolean;
  onUpdatePreset: (presetId: PresetId) => boolean;
  onRenamePreset: (presetId: PresetId, name: string) => boolean;
  onDeletePreset: (presetId: PresetId) => boolean;
  onToggleAlwaysOnTop: () => Promise<void>;
  onReset: () => Promise<void>;
}

function formatTime(totalSeconds: number): string {
  if (totalSeconds < 0.01) return "0s";
  if (totalSeconds < 60) {
    return `${Math.floor(totalSeconds)}s`;
  }
  if (totalSeconds < 3600) {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatNumber(n: number): string {
  return Math.floor(n).toLocaleString();
}

function formatCpu(cpu: number): string {
  if (cpu < 0) return "N/A";
  return `${cpu.toFixed(1)}%`;
}

function PresetRow({
  preset,
  isActive,
  isEditing,
  isConfirmingDelete,
  running,
  renameDraft,
  onRenameDraftChange,
  onStartRename,
  onCancelRename,
  onCommitRename,
  onApply,
  onUpdatePreset,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  preset: PresetDefinition;
  isActive: boolean;
  isEditing: boolean;
  isConfirmingDelete: boolean;
  running: boolean;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onCommitRename: () => void;
  onApply: () => void;
  onUpdatePreset: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  return (
    <div
      className={`preset-card ${isActive ? "preset-card--active" : ""}`}
      data-preset-id={preset.id}
    >
      <div className="preset-card-head">
        <div className="preset-card-meta">
          {isEditing ? (
            <input
              className="preset-rename-input"
              value={renameDraft}
              maxLength={PRESET_NAME_MAX_LENGTH}
              onChange={(event) => onRenameDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCommitRename();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  onCancelRename();
                }
              }}
              autoFocus
            />
          ) : (
            <span className="preset-name">{preset.name}</span>
          )}
          <div className="preset-badges">
            {isActive && <span className="preset-badge preset-badge--active">Active</span>}
            <span className="preset-badge">
              {new Date(preset.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="preset-actions">
          {isEditing ? (
            <>
              <button
                className="settings-btn-secondary"
                onClick={onCommitRename}
                disabled={running}
              >
                Save
              </button>
              <button className="settings-btn-quiet" onClick={onCancelRename}>
                Cancel
              </button>
            </>
          ) : isConfirmingDelete ? (
            <>
              <button
                className="settings-btn-danger settings-btn-danger--compact"
                onClick={onConfirmDelete}
                disabled={running}
              >
                Confirm?
              </button>
              <button className="settings-btn-quiet" onClick={onCancelDelete}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                className="settings-btn-primary"
                onClick={onApply}
                disabled={running}
              >
                Apply
              </button>
              <button
                className="settings-btn-secondary"
                onClick={onUpdatePreset}
                disabled={running}
              >
                Update
              </button>
              <button
                className="settings-btn-secondary"
                onClick={onStartRename}
                disabled={running}
              >
                Rename
              </button>
              <button
                className="settings-btn-danger settings-btn-danger--compact"
                onClick={onRequestDelete}
                disabled={running}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPanel({
  settings,
  update,
  running,
  appInfo,
  onSavePreset,
  onApplyPreset,
  onUpdatePreset,
  onRenamePreset,
  onDeletePreset,
  onToggleAlwaysOnTop,
  onReset,
}: Props) {
  const [resetting, setResetting] = useState(false);
  const [resettingStats, setResettingStats] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [stats, setStats] = useState<CumulativeStats | null>(null);
  const [atBottom, setAtBottom] = useState(false);
  const [autostartEnabled, setAutostartEnabled] = useState<boolean | null>(null);
  const [newPresetName, setNewPresetName] = useState("");
  const [editingPresetId, setEditingPresetId] = useState<PresetId | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<PresetId | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<CumulativeStats>("get_stats")
      .then(setStats)
      .catch(() => {});
    invoke<boolean>("get_autostart_enabled")
      .then(setAutostartEnabled)
      .catch(() => setAutostartEnabled(false));
  }, []);

  useEffect(() => {
    if (!confirmingDeleteId) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const presetCard = target.closest("[data-preset-id]");
      if (presetCard?.getAttribute("data-preset-id") === confirmingDeleteId) {
        return;
      }

      setConfirmingDeleteId(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [confirmingDeleteId]);

  const handleScroll = () => {
    const el = panelRef.current;
    if (!el) return;
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
  };

  const handleSavePreset = () => {
    if (onSavePreset(newPresetName)) {
      setNewPresetName("");
      setConfirmingDeleteId(null);
    }
  };

  const handleStartRename = (preset: PresetDefinition) => {
    setConfirmingDeleteId(null);
    setEditingPresetId(preset.id);
    setRenameDraft(preset.name);
  };

  const handleCommitRename = () => {
    if (!editingPresetId) {
      return;
    }

    if (onRenamePreset(editingPresetId, renameDraft)) {
      setEditingPresetId(null);
      setRenameDraft("");
    }
  };

  const handleCancelRename = () => {
    setEditingPresetId(null);
    setRenameDraft("");
  };

  const handleRequestDelete = (presetId: PresetId) => {
    setEditingPresetId(null);
    setRenameDraft("");
    setConfirmingDeleteId(presetId);
  };

  const handleConfirmDelete = (presetId: PresetId) => {
    if (onDeletePreset(presetId)) {
      setConfirmingDeleteId(null);
    }
  };

  const handleAlwaysOnTopChange = (nextValue: boolean) => {
    if (settings.alwaysOnTop === nextValue) {
      return;
    }

    void onToggleAlwaysOnTop();
  };

  const hasStats = stats !== null && stats.totalSessions > 0;
  const presetLimitReached = settings.presets.length >= MAX_PRESETS;
  const activeEditingPresetId = running ? null : editingPresetId;
  const activeConfirmingDeleteId = running ? null : confirmingDeleteId;

  const handleConfirmResetSettings = async () => {
    setResetting(true);
    try {
      await onReset();
      setAutostartEnabled(false);
    } finally {
      setResetting(false);
      setPendingAction(null);
    }
  };

  const handleConfirmClearStats = async () => {
    setResettingStats(true);
    try {
      const next = await invoke<CumulativeStats>("reset_stats");
      setStats(next);
    } catch {
      // swallow — failure leaves stats unchanged
    } finally {
      setResettingStats(false);
      setPendingAction(null);
    }
  };

  return (
    <div className="settings-wrapper">
      <div className="settings-panel" ref={panelRef} onScroll={handleScroll}>
        <div className="social-links">
          <span className="settings-label">Support Me</span>
          <div className="social-icons">
            <a
              className="social-icon social-icon--kofi"
              href="#"
              title="Ko-fi"
              onClick={(e) => {
                e.preventDefault();
                open("https://ko-fi.com/Z8Z71T8QD4");
              }}
            >
              <img
                height="28"
                style={{ border: 0, height: "28px" }}
                src="https://storage.ko-fi.com/cdn/kofi3.png?v=6"
                alt="Buy Me a Coffee at ko-fi.com"
              />
            </a>

            <a
              className="social-icon social-icon--youtube"
              href="#"
              title="YouTube"
              onClick={(e) => {
                e.preventDefault();
                open("https://youtube.com/@Blur009");
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="18"
                height="18"
              >
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            </a>
            <a
              className="social-icon social-icon--twitch"
              href="#"
              title="Twitch"
              onClick={(e) => {
                e.preventDefault();
                open("https://twitch.tv/Blur009");
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="18"
                height="18"
              >
                <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
              </svg>
            </a>
            <a
              className="social-icon social-icon--github"
              href="#"
              title="GitHub"
              onClick={(e) => {
                e.preventDefault();
                open("https://github.com/Blur009/Blur-AutoClicker");
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="18"
                height="18"
              >
                <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.2.8-.6v-2c-3.3.7-4-1.4-4-1.4-.5-1.3-1.2-1.7-1.2-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 .1.8 1.8 3.4 1.2.1-.7.4-1.2.7-1.5-2.7-.3-5.4-1.3-5.4-6a4.7 4.7 0 0 1 1.2-3.2c-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.2 11.2 0 0 1 6.1 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2a4.7 4.7 0 0 1 1.2 3.2c0 4.7-2.8 5.7-5.4 6 .4.3.8 1 .8 2.1v3.1c0 .4.2.7.8.6A12 12 0 0 0 12 .3" />
              </svg>
            </a>
          </div>
        </div>

        <div className="settings-row">
          <span className="settings-label">Version</span>
          <span className="settings-value">v{appInfo.version}</span>
        </div>

        <div className="settings-divider" />

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Your Usage Data</span>
            <span className="settings-sublabel">
              Your personal clicker stats, tracked locally.
            </span>
          </div>
        </div>
        {hasStats ? (
          <div className="stats-grid">
            <div className="stats-cell">
              <span className="stats-cell-label">Total Clicks</span>
              <span className="stats-cell-value">
                {formatNumber(stats.totalClicks)}
              </span>
            </div>
            <div className="stats-cell">
              <span className="stats-cell-label">Total Time Spent Clicking</span>
              <span className="stats-cell-value">
                {formatTime(stats.totalTimeSecs)}
              </span>
            </div>
            <div className="stats-cell">
              <span className="stats-cell-label">CPU Usage Avg</span>
              <span className="stats-cell-value">{formatCpu(stats.avgCpu)}</span>
            </div>
            <div className="stats-cell">
              <span className="stats-cell-label">Sessions</span>
              <span className="stats-cell-value">{stats.totalSessions}</span>
            </div>
          </div>
        ) : (
          <div className="stats-empty">No runs recorded yet</div>
        )}

        <div className="settings-divider" />

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Always on Top</span>
            <span className="settings-sublabel">
              Keep the app pinned above other windows.
            </span>
          </div>
          <div className="settings-seg-group">
            {["On", "Off"].map((option) => (
              <button
                key={option}
                className={`settings-seg-btn ${(settings.alwaysOnTop ? "On" : "Off") === option ? "active" : ""}`}
                onClick={() => handleAlwaysOnTopChange(option === "On")}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Stop Hitbox Overlay</span>
            <span className="settings-sublabel">
              Toggle the stop-zone overlay preview.
            </span>
          </div>
          <div className="settings-seg-group">
            {["On", "Off"].map((option) => (
              <button
                key={option}
                className={`settings-seg-btn ${(settings.showStopOverlay ? "On" : "Off") === option ? "active" : ""}`}
                onClick={() => update({ showStopOverlay: option === "On" })}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Stop Reason Alert</span>
            <span className="settings-sublabel">
              Show why the clicker stopped in the title bar.
            </span>
          </div>
          <div className="settings-seg-group">
            {["On", "Off"].map((option) => (
              <button
                key={option}
                className={`settings-seg-btn ${(settings.showStopReason ? "On" : "Off") === option ? "active" : ""}`}
                onClick={() => update({ showStopReason: option === "On" })}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Strict Hotkey Modifiers</span>
            <span className="settings-sublabel">
              On: hotkey only fires when modifier keys match exactly. Off: extra held modifiers (e.g. Shift while gaming) are ignored.
            </span>
          </div>
          <div className="settings-seg-group">
            {["On", "Off"].map((o) => (
              <button
                key={o}
                className={`settings-seg-btn ${(settings.strictHotkeyModifiers ? "On" : "Off") === o ? "active" : ""}`}
                onClick={() => update({ strictHotkeyModifiers: o === "On" })}
              >
                {o}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-divider" />
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Minimize to Tray</span>
            <span className="settings-sublabel">
              When enabled, closing the window hides it to the system tray instead of quitting.
            </span>
          </div>
          <div className="settings-seg-group">
            {["On", "Off"].map((o) => (
              <button
                key={o}
                className={`settings-seg-btn ${(settings.minimizeToTray ? "On" : "Off") === o ? "active" : ""}`}
                onClick={() => update({ minimizeToTray: o === "On" })}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Run on Startup</span>
            <span className="settings-sublabel">
              Automatically start BlurAutoClicker with Windows, minimized to tray.
            </span>
          </div>
          <div className="settings-seg-group">
            {["On", "Off"].map((o) => (
              <button
                key={o}
                className={`settings-seg-btn ${autostartEnabled === (o === "On") ? "active" : ""}`}
                disabled={autostartEnabled === null}
                onClick={() => {
                  const next = o === "On";
                  invoke("set_autostart_enabled", { enabled: next })
                    .then(() => setAutostartEnabled(next))
                    .catch(console.error);
                }}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-divider" />

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Theme</span>
            <span className="settings-sublabel">
              Switch between dark and light themes.
            </span>
          </div>
          <div className="settings-seg-group">
            {(["Dark", "Light"] as const).map((option) => (
              <button
                key={option}
                className={`settings-seg-btn ${(settings.theme === "light" ? "Light" : "Dark") === option ? "active" : ""}`}
                onClick={() =>
                  update({ theme: option.toLowerCase() as "dark" | "light" })
                }
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Accent Color</span>
            <span className="settings-sublabel">
              Customize the primary accent used for active states.
            </span>
          </div>
          <div className="settings-color-controls">
            <label className="settings-color-picker">
              <input
                type="color"
                value={settings.accentColor}
                onChange={(event) => update({ accentColor: event.target.value })}
              />
            </label>
            <span className="settings-value settings-value--mono">
              {settings.accentColor.toUpperCase()}
            </span>
            <button
              className="settings-btn-secondary"
              onClick={() => update({ accentColor: DEFAULT_ACCENT_COLOR })}
              disabled={settings.accentColor === DEFAULT_ACCENT_COLOR}
            >
              Reset
            </button>
          </div>
        </div>

        <div className="settings-divider" />

        <div className="settings-row settings-row--stacked">
          <div className="settings-label-group">
            <span className="settings-label">Presets</span>
            <span className="settings-sublabel">
              Save and reuse named clicker configurations.
            </span>
          </div>
          <div className="preset-compose">
            <input
              className="preset-name-input"
              placeholder="Preset name"
              value={newPresetName}
              maxLength={PRESET_NAME_MAX_LENGTH}
              onChange={(event) => setNewPresetName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (!running && !presetLimitReached && newPresetName.trim()) {
                    handleSavePreset();
                  }
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setNewPresetName("");
                }
              }}
              disabled={running}
            />
            <button
              className="settings-btn-primary"
              onClick={handleSavePreset}
              disabled={
                running ||
                presetLimitReached ||
                newPresetName.trim().length === 0
              }
            >
              Save New
            </button>
          </div>
          {presetLimitReached && (
            <span className="settings-note">
              Preset limit reached. Delete one before saving another.
            </span>
          )}
          {running && (
            <span className="settings-note">
              Preset actions are disabled while the clicker is running.
            </span>
          )}
          {settings.presets.length > 0 ? (
            <div className="preset-list">
              {settings.presets.map((preset) => (
                <PresetRow
                  key={preset.id}
                  preset={preset}
                  isActive={settings.activePresetId === preset.id}
                  isEditing={activeEditingPresetId === preset.id}
                  isConfirmingDelete={activeConfirmingDeleteId === preset.id}
                  running={running}
                  renameDraft={activeEditingPresetId === preset.id ? renameDraft : preset.name}
                  onRenameDraftChange={setRenameDraft}
                  onStartRename={() => handleStartRename(preset)}
                  onCancelRename={handleCancelRename}
                  onCommitRename={handleCommitRename}
                  onApply={() => {
                    setConfirmingDeleteId(null);
                    onApplyPreset(preset.id);
                  }}
                  onUpdatePreset={() => {
                    setConfirmingDeleteId(null);
                    onUpdatePreset(preset.id);
                  }}
                  onRequestDelete={() => handleRequestDelete(preset.id)}
                  onCancelDelete={() => setConfirmingDeleteId(null)}
                  onConfirmDelete={() => handleConfirmDelete(preset.id)}
                />
              ))}
            </div>
          ) : (
            <div className="stats-empty">
              No presets saved yet. Save one from your current clicker settings.
            </div>
          )}
        </div>

        <div className="settings-divider" />

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Reset All Settings</span>
            <span className="settings-sublabel">
              Reset all saved settings and presets back to defaults.
            </span>
          </div>
          <button
            className="settings-btn-danger"
            onClick={() => {
              setResetting(true);
              onReset()
                .then(() => setAutostartEnabled(false))
                .finally(() => setResetting(false));
            }}
          >
            {resetting ? "Resetting..." : "Reset"}
          </button>
        </div>
      </div>
      <div
        className={`settings-fade ${atBottom ? "settings-fade--hidden" : ""}`}
      ></div>
      <ConfirmDialog
        open={pendingAction === "reset-settings"}
        title="Reset all settings?"
        message="All inputs, hotkeys, and preferences will return to their defaults. This can't be undone."
        confirmLabel="Reset"
        busy={resetting}
        onConfirm={handleConfirmResetSettings}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmDialog
        open={pendingAction === "clear-stats"}
        title="Clear usage data?"
        message="Your total clicks, session count, time spent clicking, and CPU averages will be permanently erased."
        confirmLabel="Clear"
        busy={resettingStats}
        onConfirm={handleConfirmClearStats}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
