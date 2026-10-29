import { memo, useEffect, useRef, useState } from "react";
import { useIconHover } from "@animateicons/react";
import { Volume2Icon, VolumeXIcon } from "@animateicons/react/lucide";
import "./StatusBar.css";

interface Props {
  activePresetName: string | null;
  version: string;
  stopReason: string | null;
  warning: string | null;
  running: boolean;
  paused: boolean;
  clickCount: number;
  activeClickPointIndex: number | null;
  totalClickPoints: number;
  clickLimit: number;
  clickLimitEnabled: boolean;
  timeLimitMs: number;
  showPreset: boolean;
  showSoundToggle: boolean;
  soundMuted: boolean;
  onToggleSound: () => void;
  onOpenSoundSettings: () => void;
  onGoToPresets: () => void;
  onGoToVersionInfo: () => void;
}

function SoundToggle({
  muted,
  onToggle,
  onOpenSettings,
}: {
  muted: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
}) {
  const { ref, triggerProps } = useIconHover();
  const Icon = muted ? VolumeXIcon : Volume2Icon;
  const label = muted
    ? "Sounds muted. Click to unmute, right-click for sound settings."
    : "Sounds on. Click to mute, right-click for sound settings.";

  return (
    <button
      {...triggerProps}
      className="status-bar-sound-btn"
      data-muted={muted}
      onClick={onToggle}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenSettings();
      }}
      title={label}
      aria-label={label}
      aria-pressed={!muted}
    >
      <Icon
        ref={ref}
        size={14}
        isAnimated={false}
        className="status-bar-sound-icon"
        aria-hidden="true"
      />
    </button>
  );
}

const STOP_REASON_TEXTS: Record<string, string> = {
  "Stopped from UI": "Stopped from UI",
  "Stopped from toggle": "Stopped from toggle",
  "Stopped from hotkey": "Stopped from hotkey",
  "Stopped from hold hotkey": "Stopped from hold hotkey",
  Stopped: "Stopped",
  "Top-left corner failsafe": "Top-left corner failsafe",
  "Top-right corner failsafe": "Top-right corner failsafe",
  "Bottom-left corner failsafe": "Bottom-left corner failsafe",
  "Bottom-right corner failsafe": "Bottom-right corner failsafe",
  "Top edge failsafe": "Top edge failsafe",
  "Right edge failsafe": "Right edge failsafe",
  "Bottom edge failsafe": "Bottom edge failsafe",
  "Left edge failsafe": "Left edge failsafe",
  "Blocked by Alt+Tab": "Blocked by Alt+Tab",
  "Blocked by process list": "Blocked by process list",
  "Blocked by process list: foreground application could not be identified":
    "Could not identify the app in front",
};

function translateStopReason(stopReason: string | null | undefined): string {
  if (!stopReason) return "";
  const staticText = STOP_REASON_TEXTS[stopReason];
  if (staticText) return staticText;

  const clickLimit = stopReason.match(/^Click limit reached \((.+)\)$/);
  if (clickLimit) {
    return `Click limit reached (${clickLimit[1]})`;
  }

  const timeLimit = stopReason.match(/^Time limit reached \((.+)\)$/);
  if (timeLimit) {
    return `Time limit reached (${timeLimit[1]})`;
  }

  return stopReason;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default memo(function StatusBar({
  activePresetName,
  version,
  stopReason,
  warning,
  running,
  paused,
  clickCount,
  activeClickPointIndex,
  totalClickPoints,
  clickLimit,
  clickLimitEnabled,
  timeLimitMs,
  showPreset,
  showSoundToggle,
  soundMuted,
  onToggleSound,
  onOpenSoundSettings,
  onGoToPresets,
  onGoToVersionInfo,
}: Props) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const baseElapsedRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (running && !paused) {
      segmentStartRef.current = Date.now();
      const tick = () => {
        setElapsedMs(
          baseElapsedRef.current + (Date.now() - segmentStartRef.current!),
        );
      };
      tick();
      intervalRef.current = setInterval(tick, 500);
    } else if (running && paused) {
      if (segmentStartRef.current !== null) {
        baseElapsedRef.current += Date.now() - segmentStartRef.current;
        segmentStartRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      baseElapsedRef.current = 0;
      segmentStartRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [running, paused]);

  let centerText = "";
  let hasWarning = false;

  if (warning) {
    centerText = `⚠ ${warning}`;
    hasWarning = true;
  } else if (running) {
    const parts: string[] = [];

    if (paused) {
      parts.push("Paused");
    }

    if (totalClickPoints > 1 && activeClickPointIndex !== null) {
      parts.push(`Pt ${activeClickPointIndex + 1}/${totalClickPoints}`);
    }

    const elapsed = formatElapsed(elapsedMs);
    if (timeLimitMs > 0) {
      parts.push(`${elapsed} / ${formatElapsed(timeLimitMs)}`);
    } else {
      parts.push(elapsed);
    }

    if (clickLimitEnabled && clickLimit > 0) {
      parts.push(`${clickCount} / ${clickLimit} clicks`);
    } else if (clickCount > 0) {
      parts.push(`${clickCount} clicks`);
    }

    if (paused && stopReason) {
      parts.push(translateStopReason(stopReason));
    }

    centerText = parts.join("\u00A0\u00A0•\u00A0\u00A0");
  } else if (stopReason) {
    const reason = translateStopReason(stopReason);
    centerText = clickCount > 0 ? `${reason} • ${clickCount} clicks` : reason;
  }

  return (
    <div className="status-bar" data-running={running}>
      <div className="status-bar-left">
        {showSoundToggle && (
          <SoundToggle
            muted={soundMuted}
            onToggle={onToggleSound}
            onOpenSettings={onOpenSoundSettings}
          />
        )}
        {showPreset &&
          (activePresetName ? (
            <button
              className="status-bar-preset-btn"
              onClick={onGoToPresets}
              title="Go to presets"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
              </svg>
              {activePresetName}
            </button>
          ) : (
            <button
              className="status-bar-hint-btn"
              onClick={onGoToPresets}
              title="Go to presets"
            >
              No preset active
            </button>
          ))}
      </div>
      <div
        className={`status-bar-center ${hasWarning ? "status-bar-center--warning" : ""} ${centerText ? "" : "status-bar-center--empty"}`}
      >
        {centerText}
      </div>
      <div className="status-bar-right">
        <button
          className="status-bar-version-btn"
          onClick={onGoToVersionInfo}
          title="Info"
        >
          v{version}
        </button>
      </div>
    </div>
  );
});
