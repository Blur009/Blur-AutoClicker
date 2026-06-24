import "./SettingsPanel.css";
import type {
  AppInfo,
  PresetDefinition,
  PresetId,
  Settings,
} from "../../store";

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import ConfirmDialog from "../ConfirmDialog";
import { changelogEntries } from "../../changelog";
import ChangelogContent from "../ChangelogContent";
import {
  DEFAULT_MAX_CLICK_SPEED,
  DEFAULT_ACCENT_COLOR,
  MAX_PRESETS,
  PRESET_NAME_MAX_LENGTH,
} from "../../settingsSchema";

type PendingAction =
  | "reset-settings"
  | "clear-stats"
  | "extended-click-speed-limit"
  | null;

const IMAGE_FILTERS = [
  {
    name: "Images",
    extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp"],
  },
];

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
  updateCheckStatus:
    | "idle"
    | "checking"
    | "available"
    | "unavailable"
    | "error";
  onCheckForUpdate: () => void;
}

function formatTime(totalSeconds: number, language: string): string {
  if (totalSeconds < 0.01) return "0s";
  if (totalSeconds < 60) {
    return `${Math.floor(totalSeconds).toLocaleString(language)}s`;
  }
  if (totalSeconds < 3600) {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return s > 0
      ? `${m.toLocaleString(language)}m ${s.toLocaleString(language)}s`
      : `${m.toLocaleString(language)}m`;
  }
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return m > 0
    ? `${h.toLocaleString(language)}h ${m.toLocaleString(language)}m`
    : `${h.toLocaleString(language)}h`;
}

function formatNumber(n: number, language: string): string {
  return Math.floor(n).toLocaleString(language);
}

function formatCpu(
  cpu: number,
  language: string,
  notAvailable: string,
): string {
  if (cpu < 0) return notAvailable;
  return `${cpu.toLocaleString(language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function SettingsSectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="settings-section-heading">
      <span className="settings-section-title">{title}</span>
      {description ? (
        <span className="settings-section-description">{description}</span>
      ) : null}
    </div>
  );
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-card">
      <SettingsSectionHeading title={title} description={description} />
      <div className="settings-card-content">{children}</div>
    </section>
  );
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
            {isActive && (
              <span className="preset-badge preset-badge--active">Active</span>
            )}
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
  updateCheckStatus,
  onCheckForUpdate,
}: Props) {
  const [resetting, setResetting] = useState(false);
  const [resettingStats, setResettingStats] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [stats, setStats] = useState<CumulativeStats | null>(null);
  const [atBottom, setAtBottom] = useState(false);
  const [presetsAtBottom, setPresetsAtBottom] = useState(true);
  const [autostartEnabled, setAutostartEnabled] = useState<boolean | null>(
    null,
  );
  const [newPresetName, setNewPresetName] = useState("");
  const [editingPresetId, setEditingPresetId] = useState<PresetId | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<PresetId | null>(
    null,
  );
  const [showChangelog, setShowChangelog] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const presetsListRef = useRef<HTMLDivElement>(null);
  const language = "en";
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

  const handlePresetsScroll = () => {
    const el = presetsListRef.current;
    if (!el) return;
    setPresetsAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
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

  const handleBrowseBackgroundImage = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: IMAGE_FILTERS,
      });
      if (selected) {
        update({ backgroundImage: selected });
      }
    } catch (err) {
      console.error("Failed to pick image:", err);
    }
  };

  const handleAlwaysOnTopChange = (nextValue: boolean) => {
    if (settings.alwaysOnTop === nextValue) {
      return;
    }

    void onToggleAlwaysOnTop();
  };

  const hasStats = stats !== null && stats.totalSessions > 0;
  const hasLastSession = settings.lastSessionDurationMs > 0;
  const presetLimitReached = settings.presets.length >= MAX_PRESETS;
  const activeEditingPresetId = running ? null : editingPresetId;
  const activeConfirmingDeleteId = running ? null : confirmingDeleteId;
  const onOffOptions = [
    { value: false, label: "Off" },
    { value: true, label: "On" },
  ];
  const advancedLayoutOptions = [
    { value: "wide" as const, label: "Wide" },
    { value: "tall" as const, label: "Tall" },
  ];

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
      update({ lastSessionDurationMs: 0 });
    } catch {
      // swallow ? failure leaves stats unchanged
    } finally {
      setResettingStats(false);
      setPendingAction(null);
    }
  };

  const handleExtendedClickSpeedLimitChange = (nextValue: boolean) => {
    if (settings.extendedClickSpeedLimit === nextValue) {
      return;
    }

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

  useEffect(() => {
    handlePresetsScroll();
  }, [settings.presets.length]);

  const updateButtonLabel = {
    idle: "Check for Update",
    checking: "Checking...",
    available: "Update found!",
    unavailable: "No update found",
    error: "Check failed",
  }[updateCheckStatus];

  return (
    <div className="settings-wrapper">
      <div className="settings-panel" ref={panelRef} onScroll={handleScroll}>
        <SettingsCard title="About" description="Version and project links.">
          <div className="social-links">
            <span className="settings-label">Support Me</span>
            <div className="social-icons">
              <a
                className="social-icon social-icon--kofi"
                href="#"
                title="Ko-fi"
                onClick={(e) => {
                  e.preventDefault();
                  void openUrl("https://ko-fi.com/Z8Z71T8QD4");
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
                  void openUrl("https://youtube.com/@Blur009");
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
                  void openUrl("https://twitch.tv/Blur009");
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
                  void openUrl("https://github.com/Blur009/Blur-AutoClicker");
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
            <div className="settings-label-group settings-label-group--inline">
              <span className="settings-label">Version</span>
              <span className="settings-value">v{appInfo.version}</span>
            </div>
            <div className="settings-row-actions">
              <button
                className="settings-btn-secondary changelog-toggle-btn"
                onClick={() => setShowChangelog((v) => !v)}
              >
                <svg
                  className={`changelog-arrow${showChangelog ? " open" : ""}`}
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                >
                  <path
                    d="M3 1L7 5L3 9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {showChangelog ? "Hide Changes" : "Show Changes"}
              </button>
              <button
                className="settings-btn-secondary check-update-btn"
                onClick={onCheckForUpdate}
                disabled={updateCheckStatus !== "idle"}
              >
                {updateButtonLabel}
              </button>
            </div>
          </div>
          {showChangelog && <ChangelogContent entries={changelogEntries} />}
        </SettingsCard>

        <SettingsCard
          title="Usage"
          description="Clicking statistics for all sessions."
        >
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Usage Data</span>
              <span className="settings-sublabel">
                Statistics are stored locally and never sent anywhere.
              </span>
            </div>
          </div>
          {hasStats || hasLastSession ? (
            <div className="stats-grid">
              {hasLastSession && (
                <div className="stats-cell">
                  <span className="stats-cell-label">Last Session</span>
                  <span className="stats-cell-value">
                    {formatTime(settings.lastSessionDurationMs / 1000, language)}
                  </span>
                </div>
              )}
              {hasStats && (
                <>
                  <div className="stats-cell">
                    <span className="stats-cell-label">Total Clicks</span>
                    <span className="stats-cell-value">
                      {formatNumber(stats.totalClicks, language)}
                    </span>
                  </div>
                  <div className="stats-cell">
                    <span className="stats-cell-label">Total Time Clicking</span>
                    <span className="stats-cell-value">
                      {formatTime(stats.totalTimeSecs, language)}
                    </span>
                  </div>
                  <div className="stats-cell">
                    <span className="stats-cell-label">Average CPU</span>
                    <span className="stats-cell-value">
                      {formatCpu(stats.avgCpu, language, "N/A")}
                    </span>
                  </div>
                  <div className="stats-cell">
                    <span className="stats-cell-label">Sessions</span>
                    <span className="stats-cell-value">
                      {formatNumber(stats.totalSessions, language)}
                    </span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="stats-empty">No session data yet.</div>
          )}
          {(hasStats || hasLastSession) && (
            <div className="settings-row">
              <div className="settings-label-group">
                <span className="settings-label">Clear Stats</span>
                <span className="settings-sublabel">Clear all usage data.</span>
              </div>
              <button
                type="button"
                className="settings-btn-danger settings-btn-danger--compact"
                onClick={() => setPendingAction("clear-stats")}
              >
                Clear
              </button>
            </div>
          )}
        </SettingsCard>

        <SettingsCard title="Presets" description="Save and load presets.">
          <div className="settings-row settings-row--stacked">
            <div className="settings-label-group">
              <span className="settings-label">Presets</span>
              <span className="settings-sublabel">
                Save and restore to quickly switch configurations.
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
                    if (
                      !running &&
                      !presetLimitReached &&
                      newPresetName.trim()
                    ) {
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
                Save
              </button>
            </div>
            {presetLimitReached && (
              <span className="settings-note">Max 6 presets allowed</span>
            )}
            {running && (
              <span className="settings-note">Disabled while clicking</span>
            )}
            {settings.presets.length > 0 ? (
              <div className="preset-list-shell">
                <div
                  className="preset-list"
                  ref={presetsListRef}
                  onScroll={handlePresetsScroll}
                >
                  {settings.presets.map((preset) => (
                    <PresetRow
                      key={preset.id}
                      preset={preset}
                      isActive={settings.activePresetId === preset.id}
                      isEditing={activeEditingPresetId === preset.id}
                      isConfirmingDelete={
                        activeConfirmingDeleteId === preset.id
                      }
                      running={running}
                      renameDraft={
                        activeEditingPresetId === preset.id
                          ? renameDraft
                          : preset.name
                      }
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
                <div
                  className={`preset-list-fade ${presetsAtBottom ? "preset-list-fade--hidden" : ""}`}
                />
              </div>
            ) : (
              <div className="stats-empty">No saved presets.</div>
            )}
          </div>
        </SettingsCard>

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
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.alwaysOnTop === option.value ? "active" : ""}`}
                  onClick={() => handleAlwaysOnTopChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Stop Hitbox Overlay</span>
              <span className="settings-sublabel">
                Show the stop zone boundaries.
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.showStopOverlay === option.value ? "active" : ""}`}
                  onClick={() => update({ showStopOverlay: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Stop Reason Alert</span>
              <span className="settings-sublabel">
                Show a notification when the auto clicker stops.
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.showStopReason === option.value ? "active" : ""}`}
                  onClick={() => update({ showStopReason: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Main Window Timers</span>
              <span className="settings-sublabel">
                Keep the session timer and stopwatch visible while using the app.
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.showStopwatchOnMainWindow === option.value ? "active" : ""}`}
                  onClick={() =>
                    update({ showStopwatchOnMainWindow: option.value })
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Strict Hotkey Modifiers</span>
              <span className="settings-sublabel">
                Require exact modifier keys for hotkeys.
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.strictHotkeyModifiers === option.value ? "active" : ""}`}
                  onClick={() =>
                    update({ strictHotkeyModifiers: option.value })
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Stop on Alt+Tab</span>
              <span className="settings-sublabel">
                Stop clicking when switching to another window.
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.taskSwitcherStopEnabled === option.value ? "active" : ""}`}
                  onClick={() =>
                    update({ taskSwitcherStopEnabled: option.value })
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Extended Click Speed Limit</span>
              <span className="settings-sublabel">
                Allow click speeds up to 1000 CPS (may affect performance).
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.extendedClickSpeedLimit === option.value ? "active" : ""}`}
                  onClick={() =>
                    handleExtendedClickSpeedLimitChange(option.value)
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Startup"
          description="Behavior when the app opens."
        >
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Minimize to Tray</span>
              <span className="settings-sublabel">
                Minimize to the system tray instead of the taskbar.
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${settings.minimizeToTray === option.value ? "active" : ""}`}
                  onClick={() => update({ minimizeToTray: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Run on Startup</span>
              <span className="settings-sublabel">
                Start clicking when the app opens.
              </span>
            </div>
            <div className="settings-seg-group">
              {onOffOptions.map((option) => (
                <button
                  key={String(option.value)}
                  className={`settings-seg-btn ${autostartEnabled === option.value ? "active" : ""}`}
                  disabled={autostartEnabled === null}
                  onClick={() => {
                    invoke("set_autostart_enabled", { enabled: option.value })
                      .then(() => setAutostartEnabled(option.value))
                      .catch(console.error);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Appearance"
          description="Customize how the app looks."
        >
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Theme</span>
              <span className="settings-sublabel">
                Choose between dark and light mode.
              </span>
            </div>
            <div className="settings-seg-group">
              {(["dark", "light"] as const).map((theme) => (
                <button
                  key={theme}
                  className={`settings-seg-btn ${settings.theme === theme ? "active" : ""}`}
                  onClick={() => update({ theme })}
                >
                  {theme === "dark" ? "Dark" : "Light"}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Advanced Layout</span>
              <span className="settings-sublabel">
                Panel layout for sequence zones.
              </span>
            </div>
            <div className="settings-seg-group">
              {advancedLayoutOptions.map((option) => (
                <button
                  key={option.value}
                  className={`settings-seg-btn ${settings.advancedSequenceLayout === option.value ? "active" : ""}`}
                  onClick={() =>
                    update({ advancedSequenceLayout: option.value })
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Accent Color</span>
              <span className="settings-sublabel">
                The primary accent color.
              </span>
            </div>
            <div className="settings-color-controls">
              <label className="settings-color-picker">
                <input
                  type="color"
                  value={settings.accentColor}
                  onChange={(event) =>
                    update({ accentColor: event.target.value })
                  }
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

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Background Image</span>
              <span className="settings-sublabel">
                Path or URL to a background image.
              </span>
            </div>
            <div className="settings-bg-image-row">
              <input
                className="settings-bg-input"
                type="text"
                value={settings.backgroundImage}
                onChange={(event) =>
                  update({ backgroundImage: event.target.value })
                }
                placeholder="https://example.com/image.png"
              />
              <div className="settings-bg-buttons">
                <button
                  className="settings-btn-secondary"
                  onClick={handleBrowseBackgroundImage}
                >
                  Browse
                </button>
                <button
                  className="settings-btn-danger settings-btn-danger--compact"
                  onClick={() => update({ backgroundImage: "" })}
                  disabled={!settings.backgroundImage}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Background Opacity</span>
              <span className="settings-sublabel">
                Transparency of the background image.
              </span>
            </div>
            <div className="settings-opacity-controls">
              <input
                type="range"
                className="settings-opacity-slider"
                min="0"
                max="100"
                value={settings.backgroundOpacity}
                disabled={!settings.backgroundImage}
                onChange={(event) =>
                  update({
                    backgroundOpacity: Number(event.target.value),
                  })
                }
              />
              <span className="settings-slider-value">
                {settings.backgroundOpacity}%
              </span>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Panel Opacity</span>
              <span className="settings-sublabel">
                Transparency of the settings panel.
              </span>
            </div>
            <div className="settings-opacity-controls">
              <input
                type="range"
                className="settings-opacity-slider"
                min="0"
                max="100"
                value={settings.panelOpacity}
                onChange={(event) =>
                  update({
                    panelOpacity: Number(event.target.value),
                  })
                }
              />
              <span className="settings-slider-value">
                {settings.panelOpacity}%
              </span>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Panel Blur</span>
              <span className="settings-sublabel">
                Blur effect behind the panel.
              </span>
            </div>
            <div className="settings-opacity-controls">
              <input
                type="range"
                className="settings-opacity-slider"
                min="0"
                max="20"
                value={settings.panelBlur}
                onChange={(event) =>
                  update({
                    panelBlur: Number(event.target.value),
                  })
                }
              />
              <span className="settings-slider-value">
                {settings.panelBlur}px
              </span>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Reset"
          description="Reset all settings or usage data."
        >
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Reset All</span>
              <span className="settings-sublabel">
                Reset all settings to their defaults.
              </span>
            </div>
            <button
              className="settings-btn-danger"
              onClick={() => setPendingAction("reset-settings")}
            >
              Reset
            </button>
          </div>
        </SettingsCard>
      </div>
      <div
        className={`settings-fade ${atBottom ? "settings-fade--hidden" : ""}`}
      ></div>
      <ConfirmDialog
        open={pendingAction === "reset-settings"}
        title="Reset all settings"
        message="This will reset all settings to their default values. This action cannot be undone."
        confirmLabel="Reset"
        busy={resetting}
        onConfirm={handleConfirmResetSettings}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmDialog
        open={pendingAction === "clear-stats"}
        title="Clear usage data"
        message="This will clear all usage data. This action cannot be undone."
        confirmLabel="Clear"
        busy={resettingStats}
        onConfirm={handleConfirmClearStats}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmDialog
        open={pendingAction === "extended-click-speed-limit"}
        title="Enable extended click speed limit?"
        message="This will allow click speeds beyond the default limit. This may affect performance."
        confirmLabel="Enable"
        onConfirm={handleConfirmExtendedClickSpeedLimit}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
