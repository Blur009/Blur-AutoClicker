import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useIconHover } from "@animateicons/react";
import { FolderOpenIcon, RotateCcwIcon } from "@animateicons/react/lucide";
import type { AnimatedIcon } from "../../../animatedIcon";
import { logDiagnostic } from "../../../../diagnostics";
import {
  playClickerSound,
  SOUND_FILE_EXTENSIONS,
  soundFileName,
  type ClickerSoundKind,
} from "../../../../soundPlayback";
import type { Settings } from "../../../../store";
import { SettingsCard } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const SOUND_FILTERS = [
  { name: "Audio", extensions: SOUND_FILE_EXTENSIONS },
  { name: "All files", extensions: ["*"] },
];

type SoundField = "enable" | "disable";

const FIELDS: Record<
  SoundField,
  {
    kind: ClickerSoundKind;
    enabledKey: "enableSoundEnabled" | "disableSoundEnabled";
    pathKey: "enableSoundPath" | "disableSoundPath";
    volumeKey: "enableSoundVolume" | "disableSoundVolume";
  }
> = {
  enable: {
    kind: "enable",
    enabledKey: "enableSoundEnabled",
    pathKey: "enableSoundPath",
    volumeKey: "enableSoundVolume",
  },
  disable: {
    kind: "disable",
    enabledKey: "disableSoundEnabled",
    pathKey: "disableSoundPath",
    volumeKey: "disableSoundVolume",
  },
};

function IconButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  variant,
}: {
  label: string;
  icon: AnimatedIcon;
  onClick: () => void;
  disabled?: boolean;
  variant: "text" | "icon";
}) {
  const { ref, triggerProps } = useIconHover();

  return (
    <button
      {...triggerProps}
      className={
        variant === "text"
          ? "settings-btn-secondary sounds-file-btn"
          : "settings-btn-quiet settings-btn-icon"
      }
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={variant === "icon" ? label : undefined}
    >
      <Icon
        ref={ref}
        size={14}
        isAnimated={false}
        className="sounds-btn-icon"
        aria-hidden="true"
      />
      {variant === "text" ? label : null}
    </button>
  );
}

function SoundCard({
  field,
  label,
  description,
  settings,
  update,
}: {
  field: SoundField;
  label: string;
  description: string;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  const { kind, enabledKey, pathKey, volumeKey } = FIELDS[field];
  const enabled = settings[enabledKey];
  const path = settings[pathKey];
  const volume = settings[volumeKey];
  const isCustom = path.trim().length > 0;
  const fileName = soundFileName(path, kind);

  const handleToggle = useCallback(
    () => update({ [enabledKey]: !enabled }),
    [enabled, enabledKey, update],
  );

  const handleBrowse = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: SOUND_FILTERS,
      });
      if (typeof selected !== "string") return;
      const next = { ...settings, [pathKey]: selected } as Settings;
      update({ [pathKey]: selected });
      void playClickerSound(kind, next);
    } catch (err) {
      logDiagnostic("SoundsSection.pickSound", {
        error: String(err),
      });
    }
  }, [kind, pathKey, settings, update]);

  const handleReset = useCallback(() => {
    update({ [pathKey]: "" });
  }, [pathKey, update]);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      update({ [volumeKey]: Number(e.target.value) }),
    [volumeKey, update],
  );

  return (
    <SettingsCard title={label} description={description}>
      <div className="settings-row settings-row--inline">
        <div className="settings-label-group">
          <span className="settings-label">Play sound</span>
          <span className="settings-sublabel">
            Flip it off to silence this sound.
          </span>
        </div>
        <div className="settings-toggle-wrapper">
          <button
            className={`settings-toggle ${enabled ? "on" : "off"}`}
            onClick={handleToggle}
            aria-pressed={enabled}
            aria-label={label}
          >
            <span className="settings-toggle-knob" />
          </button>
        </div>
      </div>

      <div className="settings-row settings-row--inline">
        <div className="settings-label-group">
          <span className="settings-label">Sound file</span>
          <span className="settings-sublabel sounds-file-name" title={path}>
            {isCustom ? fileName : `${fileName} (default)`}
          </span>
        </div>
        <div className="settings-row-actions">
          <IconButton
            label={`Choose ${label.toLowerCase()} sound file`}
            icon={FolderOpenIcon}
            variant="text"
            onClick={() => void handleBrowse()}
          />
          <IconButton
            label={`Use the default sound for ${label.toLowerCase()}`}
            icon={RotateCcwIcon}
            variant="icon"
            disabled={!isCustom}
            onClick={handleReset}
          />
        </div>
      </div>

      <div className="settings-row settings-row--inline">
        <div className="settings-label-group">
          <span className="settings-label">Sound volume</span>
          <span className="settings-sublabel">
            Multiplied by the master volume.
          </span>
        </div>
        <div className="settings-opacity-controls">
          <input
            type="range"
            className="settings-opacity-slider"
            min="0"
            max="100"
            value={volume}
            onChange={handleVolumeChange}
            aria-label={`${label} volume`}
          />
          <span className="settings-slider-value">{volume}%</span>
        </div>
      </div>
    </SettingsCard>
  );
}

export default function SoundsSection({ settings, update }: Props) {
  const handleMasterVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      update({ soundVolume: Number(e.target.value) }),
    [update],
  );

  const handleMuteToggle = useCallback(
    () => update({ soundMuted: !settings.soundMuted }),
    [settings.soundMuted, update],
  );

  return (
    <>
      <SettingsCard
        title="Volume"
        description="Applies to both sounds. The speaker button in the status bar mutes everything."
      >
        <div className="settings-row settings-row--inline">
          <div className="settings-label-group">
            <span className="settings-label">Master volume</span>
            <span className="settings-sublabel">
              Scales the volume of every sound.
            </span>
          </div>
          <div className="settings-opacity-controls">
            <input
              type="range"
              className="settings-opacity-slider"
              min="0"
              max="100"
              value={settings.soundVolume}
              onChange={handleMasterVolumeChange}
              aria-label="Master volume"
            />
            <span className="settings-slider-value">
              {settings.soundVolume}%
            </span>
          </div>
        </div>

        <div className="settings-row settings-row--inline">
          <div className="settings-label-group">
            <span className="settings-label">Mute all sounds</span>
            <span className="settings-sublabel">
              Same switch as the speaker icon in the status bar.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.soundMuted ? "on" : "off"}`}
              onClick={handleMuteToggle}
              aria-pressed={settings.soundMuted}
              aria-label="Mute all sounds"
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>
      </SettingsCard>

      <SoundCard
        field="enable"
        label="Auto clicker enabled"
        description="Plays when clicking starts."
        settings={settings}
        update={update}
      />
      <SoundCard
        field="disable"
        label="Auto clicker disabled"
        description="Plays when clicking stops, including limit and failsafe stops."
        settings={settings}
        update={update}
      />
    </>
  );
}
