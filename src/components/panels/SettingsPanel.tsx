import "./SettingsPanel.css";
import type {
  AppInfo,
  PresetDefinition,
  PresetId,
  Settings,
} from "../../store";
import {
  LANGUAGE_OPTIONS,
  useTranslation,
  type Language,
} from "../../i18n";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
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
  onStartTour: () => void;
}

function formatTime(totalSeconds: number, language: Language): string {
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

function formatNumber(n: number, language: Language): string {
  return Math.floor(n).toLocaleString(language);
}

function formatCpu(
  cpu: number,
  language: Language,
  notAvailable: string,
): string {
  if (cpu < 0) return notAvailable;
  return `${cpu.toLocaleString(language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
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
  const { t } = useTranslation();

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
              <span className="preset-badge preset-badge--active">
                {t("settings.presetActive")}
              </span>
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
                {t("settings.presetSave")}
              </button>
              <button className="settings-btn-quiet" onClick={onCancelRename}>
                {t("settings.presetCancel")}
              </button>
            </>
          ) : isConfirmingDelete ? (
            <>
              <button
                className="settings-btn-danger settings-btn-danger--compact"
                onClick={onConfirmDelete}
                disabled={running}
              >
                {t("settings.presetConfirmDelete")}
              </button>
              <button className="settings-btn-quiet" onClick={onCancelDelete}>
                {t("settings.presetCancel")}
              </button>
            </>
          ) : (
            <>
              <button
                className="settings-btn-primary"
                onClick={onApply}
                disabled={running}
              >
                {t("settings.presetApply")}
              </button>
              <button
                className="settings-btn-secondary"
                onClick={onUpdatePreset}
                disabled={running}
              >
                {t("settings.presetUpdate")}
              </button>
              <button
                className="settings-btn-secondary"
                onClick={onStartRename}
                disabled={running}
              >
                {t("settings.presetRename")}
              </button>
              <button
                className="settings-btn-danger settings-btn-danger--compact"
                onClick={onRequestDelete}
                disabled={running}
              >
                {t("settings.presetDelete")}
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
  onStartTour,
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
  const { language, t } = useTranslation();

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
  const onOffOptions = [
    { value: true, label: t("common.on") },
    { value: false, label: t("common.off") },
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
    } catch {
      // swallow — failure leaves stats unchanged
    } finally {
      setResettingStats(false);
      setPendingAction(null);
    }
  };

  return (
    <div className="settings-wrapper" data-tour="settings-panel">
      <div className="settings-panel" ref={panelRef} onScroll={handleScroll}>
        <div className="social-links">
          <span className="settings-label">{t("settings.supportMe")}</span>
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
          <span className="settings-label">{t("settings.version")}</span>
          <span className="settings-value">v{appInfo.version}</span>
        </div>

        <div className="settings-divider" />

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">{t("settings.usageData")}</span>
            <span className="settings-sublabel">
              {t("settings.usageDataDescription")}
            </span>
          </div>
        </div>
        {hasStats ? (
          <div className="stats-grid">
            <div className="stats-cell">
              <span className="stats-cell-label">{t("settings.totalClicks")}</span>
              <span className="stats-cell-value">
                {formatNumber(stats.totalClicks, language)}
              </span>
            </div>
            <div className="stats-cell">
              <span className="stats-cell-label">
                {t("settings.totalTimeClicking")}
              </span>
              <span className="stats-cell-value">
                {formatTime(stats.totalTimeSecs, language)}
              </span>
            </div>
            <div className="stats-cell">
              <span className="stats-cell-label">{t("settings.averageCpu")}</span>
              <span className="stats-cell-value">
                {formatCpu(stats.avgCpu, language, t("common.notAvailable"))}
              </span>
            </div>
            <div className="stats-cell">
              <span className="stats-cell-label">{t("settings.sessions")}</span>
              <span className="stats-cell-value">
                {formatNumber(stats.totalSessions, language)}
              </span>
            </div>
          </div>
        ) : (
          <div className="stats-empty">{t("settings.noRuns")}</div>
        )}
        {hasStats && (
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">{t("settings.clearStats")}</span>
              <span className="settings-sublabel">
                {t("settings.clearStatsDescription")}
              </span>
            </div>
            <button
              type="button"
              className="settings-btn-danger settings-btn-danger--compact"
              onClick={() => setPendingAction("clear-stats")}
            >
              {t("settings.clearStats")}
            </button>
          </div>
        )}

        <div className="settings-divider" />

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">{t("settings.alwaysOnTop")}</span>
            <span className="settings-sublabel">
              {t("settings.alwaysOnTopDescription")}
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
            <span className="settings-label">
              {t("settings.stopHitboxOverlay")}
            </span>
            <span className="settings-sublabel">
              {t("settings.stopHitboxOverlayDescription")}
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
            <span className="settings-label">
              {t("settings.stopReasonAlert")}
            </span>
            <span className="settings-sublabel">
              {t("settings.stopReasonAlertDescription")}
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
            <span className="settings-label">
              {t("settings.strictHotkeyModifiers")}
            </span>
            <span className="settings-sublabel">
              {t("settings.strictHotkeyModifiersDescription")}
            </span>
          </div>
          <div className="settings-seg-group">
            {onOffOptions.map((option) => (
              <button
                key={String(option.value)}
                className={`settings-seg-btn ${settings.strictHotkeyModifiers === option.value ? "active" : ""}`}
                onClick={() => update({ strictHotkeyModifiers: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-divider" />

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">
              {t("settings.minimizeToTray")}
            </span>
            <span className="settings-sublabel">
              {t("settings.minimizeToTrayDescription")}
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
            <span className="settings-label">{t("settings.runOnStartup")}</span>
            <span className="settings-sublabel">
              {t("settings.runOnStartupDescription")}
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

        <div className="settings-divider" />

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">{t("settings.language")}</span>
            <span className="settings-sublabel">
              {t("settings.languageDescription")}
            </span>
          </div>
          <div className="settings-seg-group">
            {LANGUAGE_OPTIONS.map((option) => (
              <button
                key={option.code}
                className={`settings-seg-btn ${settings.language === option.code ? "active" : ""}`}
                onClick={() => update({ language: option.code })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-divider" />

        <div className="settings-row" data-tour="settings-theme">
          <div className="settings-label-group">
            <span className="settings-label">{t("settings.theme")}</span>
            <span className="settings-sublabel">
              {t("settings.themeDescription")}
            </span>
          </div>
          <div className="settings-seg-group">
            {(["dark", "light"] as const).map((theme) => (
              <button
                key={theme}
                className={`settings-seg-btn ${settings.theme === theme ? "active" : ""}`}
                onClick={() => update({ theme })}
              >
                {t(theme === "dark" ? "common.dark" : "common.light")}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">{t("settings.accentColor")}</span>
            <span className="settings-sublabel">
              {t("settings.accentColorDescription")}
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
              {t("common.reset")}
            </button>
          </div>
        </div>

        <div className="settings-divider" />

        <div className="settings-row settings-row--stacked" data-tour="settings-presets">
          <div className="settings-label-group">
            <span className="settings-label">{t("settings.presets")}</span>
            <span className="settings-sublabel">
              {t("settings.presetsDescription")}
            </span>
          </div>
          <div className="preset-compose">
            <input
              className="preset-name-input"
              placeholder={t("settings.presetNamePlaceholder")}
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
              {t("settings.saveNewPreset")}
            </button>
          </div>
          {presetLimitReached && (
            <span className="settings-note">
              {t("settings.presetLimitReached")}
            </span>
          )}
          {running && (
            <span className="settings-note">
              {t("settings.presetActionsDisabled")}
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
            <div className="stats-empty">{t("settings.noPresets")}</div>
          )}
        </div>

        <div className="settings-divider" />

        <div className="settings-row" data-tour="settings-tour-btn">
          <div className="settings-label-group">
            <span className="settings-label">Guided Tour</span>
            <span className="settings-sublabel">
              Restart the interactive walkthrough of all features.
            </span>
          </div>
          <button
            type="button"
            className="settings-btn-secondary"
            onClick={onStartTour}
          >
            Start Tour
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">{t("settings.resetAll")}</span>
            <span className="settings-sublabel">
              {t("settings.resetAllDescription")}
            </span>
          </div>
          <button
            className="settings-btn-danger"
            onClick={() => setPendingAction("reset-settings")}
          >
            {t("common.reset")}
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
