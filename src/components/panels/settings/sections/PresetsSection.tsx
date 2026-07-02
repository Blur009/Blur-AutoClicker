import { useEffect, useRef, useState } from "react";
import {
  MAX_PRESETS,
  PRESET_NAME_MAX_LENGTH,
} from "../../../../settingsSchema";
import type { PresetDefinition, PresetId, Settings } from "../../../../store";
import { SettingsCard } from "./shared";

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

interface Props {
  settings: Settings;
  running: boolean;
  onSavePreset: (name: string) => boolean;
  onApplyPreset: (presetId: PresetId) => boolean;
  onUpdatePreset: (presetId: PresetId) => boolean;
  onRenamePreset: (presetId: PresetId, name: string) => boolean;
  onDeletePreset: (presetId: PresetId) => boolean;
}

export default function PresetsSection({
  settings,
  running,
  onSavePreset,
  onApplyPreset,
  onUpdatePreset,
  onRenamePreset,
  onDeletePreset,
}: Props) {
  const [newPresetName, setNewPresetName] = useState("");
  const [editingPresetId, setEditingPresetId] = useState<PresetId | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<PresetId | null>(
    null,
  );
  const [presetsAtBottom, setPresetsAtBottom] = useState(true);
  const presetsListRef = useRef<HTMLDivElement>(null);

  const presetLimitReached = settings.presets.length >= MAX_PRESETS;
  const activeEditingPresetId = running ? null : editingPresetId;
  const activeConfirmingDeleteId = running ? null : confirmingDeleteId;

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

  const handlePresetsScroll = () => {
    const list = presetsListRef.current;
    if (!list) return;
    setPresetsAtBottom(
      list.scrollTop + list.clientHeight >= list.scrollHeight - 2,
    );
  };

  useEffect(() => {
    handlePresetsScroll();
  }, [settings.presets.length]);

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
    if (!editingPresetId) return;
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

  return (
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
              running || presetLimitReached || newPresetName.trim().length === 0
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
                  isConfirmingDelete={activeConfirmingDeleteId === preset.id}
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
  );
}
