import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PRESET_NAME_MAX_LENGTH,
  buildPresetSnapshot,
  getPresetSummary,
} from "../../../../settingsSchema";
import type { PresetDefinition, PresetId, Settings } from "../../../../store";
import { SettingsCard } from "./shared";

interface PresetRowProps {
  preset: PresetDefinition;
  isActive: boolean;
  isModified: boolean;
  isEditing: boolean;
  isConfirmingDelete: boolean;
  running: boolean;
  renameDraft: string;
  renameError: string;
  onApply: (presetId: PresetId) => void;
  onUpdate: (presetId: PresetId) => void;
  onStartRename: (presetId: PresetId) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onRequestDelete: (presetId: PresetId) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (presetId: PresetId) => void;
  onDuplicate: (presetId: PresetId) => void;
  onExport: (presetId: PresetId) => void;
  onRenameDraftChange: (value: string) => void;
}

function samePresetValue(a: PresetDefinition, b: PresetDefinition): boolean {
  if (a === b) {
    return true;
  }
  if (a.id !== b.id || a.name !== b.name || a.updatedAt !== b.updatedAt) {
    return false;
  }
  if (a.settings === b.settings) {
    return true;
  }
  return JSON.stringify(a.settings) === JSON.stringify(b.settings);
}

function arePresetRowPropsEqual(
  prev: PresetRowProps,
  next: PresetRowProps,
): boolean {
  return (
    prev.onApply === next.onApply &&
    prev.onUpdate === next.onUpdate &&
    prev.onStartRename === next.onStartRename &&
    prev.onCommitRename === next.onCommitRename &&
    prev.onCancelRename === next.onCancelRename &&
    prev.onRequestDelete === next.onRequestDelete &&
    prev.onCancelDelete === next.onCancelDelete &&
    prev.onConfirmDelete === next.onConfirmDelete &&
    prev.onDuplicate === next.onDuplicate &&
    prev.onExport === next.onExport &&
    prev.onRenameDraftChange === next.onRenameDraftChange &&
    prev.isActive === next.isActive &&
    prev.isModified === next.isModified &&
    prev.isEditing === next.isEditing &&
    prev.isConfirmingDelete === next.isConfirmingDelete &&
    prev.running === next.running &&
    prev.renameDraft === next.renameDraft &&
    prev.renameError === next.renameError &&
    samePresetValue(prev.preset, next.preset)
  );
}

function PresetRowView({
  preset,
  isActive,
  isModified,
  isEditing,
  isConfirmingDelete,
  running,
  renameDraft,
  renameError,
  onApply,
  onUpdate,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
  onDuplicate,
  onExport,
  onRenameDraftChange,
}: PresetRowProps) {
  const formattedDate = useMemo(
    () => new Date(preset.updatedAt).toLocaleDateString(),
    [preset.updatedAt],
  );
  const summary = useMemo(
    () => getPresetSummary(preset.settings),
    [preset.settings],
  );
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
            {isActive && !isModified && (
              <span className="preset-badge preset-badge--active">Active</span>
            )}
            {isActive && isModified && (
              <span className="preset-badge preset-badge--modified">
                Modified
              </span>
            )}
            <span className="preset-badge">{formattedDate}</span>
          </div>
          <div className="preset-summary">{summary}</div>
        </div>
        <div className="preset-actions">
          {isEditing ? (
            <>
              <button
                className="settings-btn-secondary"
                onClick={() => onCommitRename()}
                disabled={running}
              >
                Save
              </button>
              <button
                className="settings-btn-quiet"
                onClick={() => onCancelRename()}
              >
                Cancel
              </button>
            </>
          ) : isConfirmingDelete ? (
            <>
              <button
                className="settings-btn-danger settings-btn-danger--compact"
                onClick={() => onConfirmDelete(preset.id)}
                disabled={running}
              >
                Confirm?
              </button>
              <button
                className="settings-btn-quiet"
                onClick={() => onCancelDelete()}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                className="settings-btn-primary"
                onClick={() => onApply(preset.id)}
                disabled={running}
              >
                Apply
              </button>
              <button
                className="settings-btn-secondary"
                onClick={() => onUpdate(preset.id)}
                disabled={running}
                title="Save the current settings into this preset"
              >
                Overwrite
              </button>
              <button
                className="settings-btn-secondary"
                onClick={() => onStartRename(preset.id)}
                disabled={running}
              >
                Rename
              </button>
              <button
                className="settings-btn-secondary"
                onClick={() => onDuplicate(preset.id)}
                disabled={running}
              >
                Duplicate
              </button>
              <button
                className="settings-btn-danger settings-btn-danger--compact"
                onClick={() => onRequestDelete(preset.id)}
                disabled={running}
              >
                Delete
              </button>
              <button
                className="settings-btn-quiet"
                onClick={() => onExport(preset.id)}
                title="Export preset"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
      {isEditing && renameError && (
        <div className="preset-rename-error">{renameError}</div>
      )}
    </div>
  );
}

const PresetRow = memo(PresetRowView, arePresetRowPropsEqual);

interface Props {
  settings: Settings;
  running: boolean;
  onSavePreset: (name: string) => boolean;
  onApplyPreset: (presetId: PresetId) => boolean;
  onUpdatePreset: (presetId: PresetId) => boolean;
  onRenamePreset: (presetId: PresetId, name: string) => boolean;
  onDeletePreset: (presetId: PresetId) => boolean;
  onDuplicatePreset: (presetId: PresetId) => boolean;
  onExportPreset: (presetId: PresetId) => Promise<boolean>;
  onImportPreset: () => Promise<boolean | null>;
}

export default function PresetsSection({
  settings,
  running,
  onSavePreset,
  onApplyPreset,
  onUpdatePreset,
  onRenamePreset,
  onDeletePreset,
  onDuplicatePreset,
  onExportPreset,
  onImportPreset,
}: Props) {
  const [newPresetName, setNewPresetName] = useState("");
  const [editingPresetId, setEditingPresetId] = useState<PresetId | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<PresetId | null>(
    null,
  );
  const [presetsAtBottom, setPresetsAtBottom] = useState(true);
  const presetsListRef = useRef<HTMLDivElement>(null);

  const activeEditingPresetId = running ? null : editingPresetId;
  const activeConfirmingDeleteId = running ? null : confirmingDeleteId;

  const activePreset = settings.activePresetId
    ? (settings.presets.find((p) => p.id === settings.activePresetId) ?? null)
    : null;

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const currentSnapshotJson = useMemo(
    () => JSON.stringify(buildPresetSnapshot(settings)),
    [settings],
  );
  const isActiveModified =
    activePreset !== null &&
    JSON.stringify(activePreset.settings) !== currentSnapshotJson;

  useEffect(() => {
    if (!confirmingDeleteId) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const presetCard = target.closest("[data-preset-id]");
      if (presetCard?.getAttribute("data-preset-id") === confirmingDeleteId)
        return;
      setConfirmingDeleteId(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [confirmingDeleteId]);

  const handlePresetsScroll = useCallback(() => {
    const list = presetsListRef.current;
    if (!list) return;
    setPresetsAtBottom(
      list.scrollTop + list.clientHeight >= list.scrollHeight - 2,
    );
  }, []);

  useEffect(() => {
    handlePresetsScroll();
  }, [settings.presets.length, handlePresetsScroll]);

  const handleSavePreset = useCallback(() => {
    if (onSavePreset(newPresetName)) {
      setNewPresetName("");
      setConfirmingDeleteId(null);
    }
  }, [newPresetName, onSavePreset]);

  const handleApplyPreset = useCallback(
    (presetId: PresetId) => {
      setConfirmingDeleteId(null);
      onApplyPreset(presetId);
    },
    [onApplyPreset],
  );

  const handleUpdatePreset = useCallback(
    (presetId: PresetId) => {
      setConfirmingDeleteId(null);
      onUpdatePreset(presetId);
    },
    [onUpdatePreset],
  );

  const handleDuplicatePreset = useCallback(
    (presetId: PresetId) => {
      setConfirmingDeleteId(null);
      onDuplicatePreset(presetId);
    },
    [onDuplicatePreset],
  );

  const handleExportPreset = useCallback(
    (presetId: PresetId) => {
      void onExportPreset(presetId);
    },
    [onExportPreset],
  );

  const handleRequestDelete = useCallback((presetId: PresetId) => {
    setEditingPresetId(null);
    setRenameDraft("");
    setRenameError("");
    setConfirmingDeleteId(presetId);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setConfirmingDeleteId(null);
  }, []);

  const handleConfirmDelete = useCallback(
    (presetId: PresetId) => {
      if (onDeletePreset(presetId)) {
        setConfirmingDeleteId(null);
      }
    },
    [onDeletePreset],
  );

  const handleStartRename = useCallback(
    (presetId: PresetId) => {
      const preset = settings.presets.find((p) => p.id === presetId);
      if (!preset) return;
      setConfirmingDeleteId(null);
      setEditingPresetId(preset.id);
      setRenameDraft(preset.name);
      setRenameError("");
    },
    [settings.presets],
  );

  const handleCommitRename = useCallback(() => {
    if (!editingPresetId) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      setRenameError("Name cannot be empty");
      return;
    }
    const duplicate = settings.presets.some(
      (p) =>
        p.id !== editingPresetId &&
        p.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicate) {
      setRenameError("A preset with this name already exists");
      return;
    }
    setRenameError("");
    if (onRenamePreset(editingPresetId, trimmed)) {
      setEditingPresetId(null);
      setRenameDraft("");
    }
  }, [editingPresetId, renameDraft, settings.presets, onRenamePreset]);

  const handleCancelRename = useCallback(() => {
    setEditingPresetId(null);
    setRenameDraft("");
    setRenameError("");
  }, []);

  const handleRenameDraftChange = useCallback((value: string) => {
    setRenameDraft(value);
  }, []);

  const handleImport = useCallback(async () => {
    await onImportPreset();
  }, [onImportPreset]);

  const presetRows = useMemo(
    () =>
      settings.presets.map((preset) => {
        const isEditingRow = activeEditingPresetId === preset.id;
        const isActiveRow = settings.activePresetId === preset.id;
        return (
          <PresetRow
            key={preset.id}
            preset={preset}
            isActive={isActiveRow}
            isModified={isActiveRow && isActiveModified}
            isEditing={isEditingRow}
            isConfirmingDelete={activeConfirmingDeleteId === preset.id}
            running={running}
            renameDraft={isEditingRow ? renameDraft : ""}
            renameError={isEditingRow ? renameError : ""}
            onApply={handleApplyPreset}
            onUpdate={handleUpdatePreset}
            onStartRename={handleStartRename}
            onCommitRename={handleCommitRename}
            onCancelRename={handleCancelRename}
            onRequestDelete={handleRequestDelete}
            onCancelDelete={handleCancelDelete}
            onConfirmDelete={handleConfirmDelete}
            onDuplicate={handleDuplicatePreset}
            onExport={handleExportPreset}
            onRenameDraftChange={handleRenameDraftChange}
          />
        );
      }),
    [
      settings.presets,
      settings.activePresetId,
      isActiveModified,
      activeEditingPresetId,
      activeConfirmingDeleteId,
      running,
      renameDraft,
      renameError,
      handleApplyPreset,
      handleUpdatePreset,
      handleStartRename,
      handleCommitRename,
      handleCancelRename,
      handleRequestDelete,
      handleCancelDelete,
      handleConfirmDelete,
      handleDuplicatePreset,
      handleExportPreset,
      handleRenameDraftChange,
    ],
  );

  return (
    <SettingsCard
      title="Presets"
      description="Saved setups you can switch between."
    >
      <div className="settings-row settings-row--stacked">
        <div className="settings-label-group">
          <span className="settings-label">Presets</span>
          <span className="settings-sublabel">
            Save your clicking setup and switch back to it later.
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
                if (!running && newPresetName.trim()) {
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
            disabled={running || newPresetName.trim().length === 0}
          >
            Save
          </button>
        </div>
        <div className="preset-toolbar">
          <button
            className="settings-btn-secondary preset-toolbar-btn"
            onClick={handleImport}
            disabled={running}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Import
          </button>
          {settings.presets.length > 0 && (
            <span className="preset-count">
              {settings.presets.length} preset
              {settings.presets.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
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
              {presetRows}
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
  );
}
