import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useIconHover } from "@animateicons/react";
import {
  ChevronDownIcon,
  ClockIcon,
  FolderOpenIcon,
  RotateCcwIcon,
  Volume1Icon,
  Volume2Icon,
  VolumeXIcon,
} from "@animateicons/react/lucide";
import type { AnimatedIcon } from "../../../animatedIcon";
import { logDiagnostic } from "../../../../diagnostics";
import {
  authorizeSoundPath,
  previewClickerSound,
  resolvedVolume,
  SOUND_FILE_EXTENSIONS,
  soundFileName,
  soundSrcFor,
  type ClickerSoundKind,
} from "../../../../soundPlayback";
import { soundTrimFor, soundTrimPatch } from "../../../../soundTrim";
import {
  clearSoundDurationCache,
  effectivePlayLength,
  formatCompactDuration,
  probeSoundDuration,
} from "../../../../soundDuration";
import {
  pushRecentSoundPath,
  removeRecentSoundPath,
} from "../../../../soundRecents";
import SoundRecentMenu from "../SoundRecentMenu";
import SoundWaveform from "../SoundWaveform";
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

type SoundField = ClickerSoundKind;

const FIELDS: Record<
  SoundField,
  {
    enabledKey:
      "enableSoundEnabled" | "disableSoundEnabled" | "clickSoundEnabled";
    pathKey: "enableSoundPath" | "disableSoundPath" | "clickSoundPath";
    volumeKey: "enableSoundVolume" | "disableSoundVolume" | "clickSoundVolume";
  }
> = {
  enable: {
    enabledKey: "enableSoundEnabled",
    pathKey: "enableSoundPath",
    volumeKey: "enableSoundVolume",
  },
  disable: {
    enabledKey: "disableSoundEnabled",
    pathKey: "disableSoundPath",
    volumeKey: "disableSoundVolume",
  },
  click: {
    enabledKey: "clickSoundEnabled",
    pathKey: "clickSoundPath",
    volumeKey: "clickSoundVolume",
  },
};

function IconButton({
  label,
  ariaLabel,
  icon: Icon,
  onClick,
  disabled,
  variant,
}: {
  label: string;
  ariaLabel?: string;
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
      aria-label={ariaLabel ?? (variant === "icon" ? label : undefined)}
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
  fastRateToggle = false,
}: {
  field: SoundField;
  label: string;
  description: string;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  fastRateToggle?: boolean;
}) {
  const kind = field;
  const { enabledKey, pathKey, volumeKey } = FIELDS[field];
  const enabled = settings[enabledKey];
  const path = settings[pathKey];
  const volume = settings[volumeKey];
  const isCustom = path.trim().length > 0;
  const fileName = soundFileName(path, kind);
  const trim = soundTrimFor(kind, settings);
  const [previewing, setPreviewing] = useState<{
    element: HTMLAudioElement;
    seq: number;
  } | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const aliveRef = useRef(true);
  const openRef = useRef(false);

  useEffect(() => {
    previewRef.current = previewing?.element ?? null;
  }, [previewing]);

  const stopPreview = useCallback(() => {
    previewing?.element.pause();
  }, [previewing]);

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
      clearSoundDurationCache();
      update({
        [pathKey]: selected,
        ...soundTrimPatch(kind, { start: 0, end: 0 }),
        recentSoundPaths: pushRecentSoundPath(
          settings.recentSoundPaths,
          selected,
        ),
      });
    } catch (err) {
      logDiagnostic("SoundsSection.pickSound", {
        error: String(err),
      });
    }
  }, [kind, pathKey, settings.recentSoundPaths, update]);

  const handleReset = useCallback(() => {
    clearSoundDurationCache();
    update({ [pathKey]: "", ...soundTrimPatch(kind, { start: 0, end: 0 }) });
  }, [kind, pathKey, update]);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      update({ [volumeKey]: Number(e.target.value) }),
    [volumeKey, update],
  );

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [probe, setProbe] = useState<{ src: string; ms: number } | null>(null);
  const [authorizedSrc, setAuthorizedSrc] = useState<string | null>(null);

  const src = soundSrcFor(kind, settings);
  const durationMs = probe?.src === src ? probe.ms : null;

  useEffect(() => {
    let cancelled = false;
    const custom = path.trim();
    void (custom ? authorizeSoundPath(custom) : Promise.resolve(true))
      .then(() => {
        if (cancelled) return null;
        setAuthorizedSrc(src);
        return probeSoundDuration(src);
      })
      .then((duration) => {
        if (!cancelled && duration !== null) setProbe({ src, ms: duration });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [src, path]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      previewRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    openRef.current = detailsOpen;
  }, [detailsOpen]);

  const toggleDetails = () => {
    if (!detailsOpen) {
      setDetailsOpen(true);
      return;
    }
    previewRef.current?.pause();
    setPreviewing(null);
    setDetailsOpen(false);
  };

  const playLength = formatCompactDuration(
    effectivePlayLength(trim.start, trim.end, durationMs),
  );
  const VolumeIcon =
    volume === 0 ? VolumeXIcon : volume < 50 ? Volume1Icon : Volume2Icon;
  const lengthId = `sound-length-${kind}`;
  const volumeId = `sound-volume-${kind}`;

  const detailsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!detailsOpen) return;
    const timer = window.setTimeout(() => {
      const node = detailsRef.current;
      const panel = node?.closest<HTMLElement>(".settings-panel");
      if (!node || !panel) return;
      if (typeof panel.scrollBy !== "function") return;
      const panelRect = panel.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      const overflow = nodeRect.bottom - (panelRect.bottom - 8);
      if (overflow > 0) {
        panel.scrollBy({
          top: overflow + 12,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        });
      }
    }, 240);
    return () => window.clearTimeout(timer);
  }, [detailsOpen]);

  return (
    <SettingsCard
      title={label}
      description={description}
      actions={
        <div className="settings-toggle-wrapper">
          <button
            className={`settings-toggle ${enabled ? "on" : "off"}`}
            onClick={handleToggle}
            aria-pressed={enabled}
            aria-label={`${label} sound`}
          >
            <span className="settings-toggle-knob" />
          </button>
        </div>
      }
    >
      <div className="settings-row settings-row--inline">
        <div className="settings-label-group">
          <span className="settings-label">Sound file</span>
          <span className="settings-sublabel sounds-file-name" title={path}>
            {isCustom ? fileName : `${fileName} (default)`}
          </span>
        </div>
        <div className="settings-row-actions">
          <div className="sound-file-buttons">
            <IconButton
              label="Choose sound"
              ariaLabel={`Choose sound: ${label.toLowerCase()}`}
              icon={FolderOpenIcon}
              variant="text"
              onClick={() => void handleBrowse()}
            />
            <SoundRecentMenu
              paths={settings.recentSoundPaths}
              label={label}
              onPick={(selected) =>
                update({
                  [pathKey]: selected,
                  ...soundTrimPatch(kind, { start: 0, end: 0 }),
                  recentSoundPaths: pushRecentSoundPath(
                    settings.recentSoundPaths,
                    selected,
                  ),
                })
              }
              onRemove={(selected) =>
                update({
                  recentSoundPaths: removeRecentSoundPath(
                    settings.recentSoundPaths,
                    selected,
                  ),
                })
              }
            />
          </div>
          <IconButton
            label="Use default sound"
            ariaLabel={`Use the default sound for ${label.toLowerCase()}`}
            icon={RotateCcwIcon}
            variant="icon"
            disabled={!isCustom}
            onClick={handleReset}
          />
        </div>
      </div>

      {fastRateToggle && (
        <div className="settings-row settings-row--inline">
          <div className="settings-label-group">
            <span className="settings-label">
              Allow more than 10 per second
            </span>
            <span
              className={`settings-sublabel${
                settings.clickSoundAllowFastRate
                  ? " sound-fastrate-warning"
                  : ""
              }`}
            >
              {settings.clickSoundAllowFastRate
                ? "Sounds can overlap or stutter at this rate."
                : "Only needed for very fast clicking."}
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${
                settings.clickSoundAllowFastRate ? "on" : "off"
              }`}
              aria-pressed={settings.clickSoundAllowFastRate}
              aria-label="Allow more than 10 per second"
              onClick={() =>
                update({
                  clickSoundAllowFastRate: !settings.clickSoundAllowFastRate,
                })
              }
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>
      )}

      <div className="sound-details" data-open={detailsOpen} ref={detailsRef}>
        <button
          type="button"
          className="sound-details-toggle"
          aria-expanded={detailsOpen}
          aria-label={`${label} trim and volume`}
          aria-describedby={`${lengthId} ${volumeId}`}
          onClick={toggleDetails}
        >
          <ChevronDownIcon
            className="sound-details-chevron"
            size={12}
            isAnimated={false}
            aria-hidden="true"
          />
          <span className="sound-details-title">Trim and volume</span>
          <span className="sound-details-summary" id={lengthId}>
            <ClockIcon size={11} isAnimated={false} aria-hidden="true" />
            {playLength && <span>{playLength}</span>}
          </span>
          <span className="sound-details-volume" id={volumeId}>
            <VolumeIcon size={11} isAnimated={false} aria-hidden="true" />
            <span>{volume}%</span>
          </span>
        </button>

        <div className="sound-details-clip">
          <div className="sound-details-body" inert={!detailsOpen}>
            <SoundWaveform
              src={src}
              label={label}
              active={detailsOpen && authorizedSrc === src}
              trimStart={trim.start}
              trimEnd={trim.end}
              onTrimChange={(start, end) =>
                update(soundTrimPatch(kind, { start, end }))
              }
              volume={resolvedVolume(settings.soundVolume, volume) * 100}
              playback={previewing?.element ?? null}
              previewSeq={previewing?.seq ?? 0}
              onPreview={() => {
                void previewClickerSound(kind, settings).then((element) => {
                  if (!element) return;
                  if (!aliveRef.current || !openRef.current) {
                    element.pause();
                    return;
                  }
                  setPreviewing((current) => ({
                    element,
                    seq: (current?.seq ?? 0) + 1,
                  }));
                });
              }}
              onStop={stopPreview}
            />

            <div className="settings-row settings-row--inline">
              <div className="settings-label-group">
                <span className="settings-label">Sound volume</span>
              </div>
              <div className="settings-opacity-controls">
                <input
                  type="range"
                  className="settings-opacity-slider"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={handleVolumeChange}
                  aria-label={`${label} sound volume`}
                />
                <span className="settings-slider-value">{volume}%</span>
              </div>
            </div>
          </div>
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
        description="Applies to every sound. The speaker button in the status bar silences the clicker; previews here stay audible."
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
        description="When clicking starts."
        settings={settings}
        update={update}
      />
      <SoundCard
        field="disable"
        label="Auto clicker disabled"
        description="When clicking stops, limits and failsafes included."
        settings={settings}
        update={update}
      />
      <SoundCard
        field="click"
        fastRateToggle
        label="Every click"
        description={
          settings.clickSoundAllowFastRate
            ? "While clicking, up to 25 times a second."
            : "While clicking, up to 10 times a second."
        }
        settings={settings}
        update={update}
      />
    </>
  );
}
