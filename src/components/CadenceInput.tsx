import type { ChangeEvent, CSSProperties, FocusEvent, WheelEvent } from "react";
import "./panels/advanced/AdvancedPanel.css";
import { formatDurationSummary, RATE_INPUT_MODE_OPTIONS } from "../cadence";
import { normalizeIntegerRaw } from "../numberInput";
import type { RateInputMode, Settings } from "../store";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  variant: "simple" | "advanced";
}

const INTERVAL_OPTIONS = [
  { value: "s", label: "Second" },
  { value: "m", label: "Minute" },
  { value: "h", label: "Hour" },
  { value: "d", label: "Day" },
] as const;

function parseIntegerRaw(raw: string) {
  const normalized = normalizeIntegerRaw(raw);
  return normalized === "" || normalized === "-" ? 0 : Number(normalized);
}

function clamp(value: number, min: number, max?: number) {
  const minClamped = Math.max(min, value);
  return max === undefined ? minClamped : Math.min(max, minClamped);
}

function dynamicChWidth(value: number, min = 1, max = 3) {
  return `${clamp(String(Math.abs(value)).length, min, max)}ch`;
}

function cycleOption<T extends string>(
  options: readonly T[],
  current: T,
  direction: 1 | -1,
): T {
  const currentIndex = options.indexOf(current);
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;
  const nextIndex = (safeIndex + direction + options.length) % options.length;
  return options[nextIndex];
}

function handleWheelStep(
  event: WheelEvent<HTMLInputElement>,
  current: number,
  min: number,
  max: number | undefined,
  apply: (next: number) => void,
) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.blur();
  const delta = event.deltaY < 0 ? 1 : -1;
  apply(clamp(current + delta, min, max));
}

function handleNumberChange(
  event: ChangeEvent<HTMLInputElement>,
  apply: (next: number) => void,
) {
  const normalized = normalizeIntegerRaw(event.target.value);
  if (normalized !== event.target.value) {
    event.target.value = normalized;
  }
  apply(parseIntegerRaw(normalized));
}

function handleNumberBlur(
  event: FocusEvent<HTMLInputElement>,
  min: number,
  max: number | undefined,
  apply: (next: number) => void,
) {
  const normalized = normalizeIntegerRaw(event.target.value);
  if (normalized !== event.target.value) {
    event.target.value = normalized;
  }
  apply(clamp(parseIntegerRaw(normalized), min, max));
}

function DurationField({
  value,
  min,
  max,
  onChange,
  style,
  unit,
  className,
}: {
  value: number;
  min: number;
  max?: number;
  onChange: (next: number) => void;
  style?: CSSProperties;
  unit: string;
  className?: string;
}) {
  return (
    <div className={className ?? "adv-numbox-sm"}>
      <input
        type="number"
        className={className ? "simple-inline-input" : "adv-number-sm"}
        value={value}
        min={min}
        max={max}
        onChange={(event) => handleNumberChange(event, onChange)}
        onBlur={(event) => handleNumberBlur(event, min, max, onChange)}
        onWheel={(event) => handleWheelStep(event, value, min, max, onChange)}
        style={style}
      />
      <span className={className ? "postfix" : "adv-unit"}>{unit}</span>
    </div>
  );
}

function renderClockIcon() {
  return (
    <svg
      className="Icon clock-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export default function CadenceInput({ settings, update, variant }: Props) {
  const switchMode = (mode: RateInputMode) => {
    update({ rateInputMode: mode });
  };

  if (variant === "simple") {
    return (
      <div className="InputBox cadence-box">
        {settings.rateInputMode === "rate" ? (
          <>
            <input
              type="number"
              className="simple-inline-input"
              value={settings.clickSpeed}
              min={1}
              max={500}
              onChange={(event) =>
                handleNumberChange(event, (next) =>
                  update({ clickSpeed: next }),
                )
              }
              onBlur={(event) =>
                handleNumberBlur(event, 1, 500, (next) =>
                  update({ clickSpeed: next }),
                )
              }
              onWheel={(event) =>
                handleWheelStep(event, settings.clickSpeed, 1, 500, (next) =>
                  update({ clickSpeed: next }),
                )
              }
            />
            <div className="vertical-devider" />
            <button
              type="button"
              className="simple-cycle-btn"
              title="Change Click Interval"
              onClick={() =>
                update({
                  clickInterval: cycleOption(
                    INTERVAL_OPTIONS.map((option) => option.value),
                    settings.clickInterval,
                    1,
                  ),
                })
              }
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                update({
                  clickInterval: cycleOption(
                    INTERVAL_OPTIONS.map((option) => option.value),
                    settings.clickInterval,
                    -1,
                  ),
                });
              }}
            >
              {INTERVAL_OPTIONS.find(
                (option) => option.value === settings.clickInterval,
              )?.label ?? "Second"}
            </button>
          </>
        ) : (
          <div className="simple-duration-group">
            <DurationField
              className="simple-duration-chip"
              value={settings.durationMinutes}
              min={0}
              onChange={(next) => update({ durationMinutes: next })}
              style={{
                width: dynamicChWidth(settings.durationMinutes, 1, 2),
                minWidth: "1ch",
              }}
              unit="m"
            />
            <DurationField
              className="simple-duration-chip"
              value={settings.durationSeconds}
              min={0}
              max={59}
              onChange={(next) => update({ durationSeconds: next })}
              style={{
                width: dynamicChWidth(settings.durationSeconds, 1, 2),
                minWidth: "1ch",
              }}
              unit="s"
            />
            <DurationField
              className="simple-duration-chip"
              value={settings.durationMilliseconds}
              min={0}
              max={999}
              onChange={(next) => update({ durationMilliseconds: next })}
              style={{
                width: dynamicChWidth(settings.durationMilliseconds, 1, 3),
                minWidth: "1ch",
              }}
              unit="ms"
            />
          </div>
        )}
        <div className="vertical-devider" />
        <button
          type="button"
          className="simple-cycle-btn"
          onClick={() =>
            switchMode(settings.rateInputMode === "rate" ? "duration" : "rate")
          }
          onContextMenu={(e) => {
            e.preventDefault();
            switchMode(settings.rateInputMode === "rate" ? "duration" : "rate");
          }}
        >
          {settings.rateInputMode === "rate" ? "Rate" : "Delay"}
        </button>
        {renderClockIcon()}
      </div>
    );
  }

  return (
    <div className="adv-cadence-block">
      <div className="adv-row adv-cadence-header">
        <span className="adv-label">Cadence</span>
        <div className="adv-seg-group">
          {RATE_INPUT_MODE_OPTIONS.map((mode) => (
            <button
              key={mode}
              type="button"
              className={`adv-seg-btn ${settings.rateInputMode === mode ? "active" : ""}`}
              onClick={() => switchMode(mode)}
            >
              {mode === "rate" ? "Rate" : "Delay"}
            </button>
          ))}
        </div>
      </div>
      {settings.rateInputMode === "rate" ? (
        <div className="adv-row">
          <div className="adv-numbox-sm">
            <input
              type="number"
              className="adv-number-sm"
              value={settings.clickSpeed}
              min={1}
              max={500}
              onChange={(event) =>
                handleNumberChange(event, (next) =>
                  update({ clickSpeed: next }),
                )
              }
              onBlur={(event) =>
                handleNumberBlur(event, 1, 500, (next) =>
                  update({ clickSpeed: next }),
                )
              }
              onWheel={(event) =>
                handleWheelStep(event, settings.clickSpeed, 1, 500, (next) =>
                  update({ clickSpeed: next }),
                )
              }
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                width: "36px",
              }}
            />
          </div>
          <span className="adv-label">Clicks Per</span>
          <div className="adv-seg-group">
            {INTERVAL_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`adv-seg-btn ${settings.clickInterval === option.value ? "active" : ""}`}
                onClick={() => update({ clickInterval: option.value })}
              >
                {option.value}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="adv-cadence-duration-row">
          <DurationField
            value={settings.durationMinutes}
            min={0}
            onChange={(next) => update({ durationMinutes: next })}
            style={{ width: "24px" }}
            unit="m"
          />
          <DurationField
            value={settings.durationSeconds}
            min={0}
            max={59}
            onChange={(next) => update({ durationSeconds: next })}
            style={{ width: "24px" }}
            unit="s"
          />
          <DurationField
            value={settings.durationMilliseconds}
            min={0}
            max={999}
            onChange={(next) => update({ durationMilliseconds: next })}
            style={{ width: "34px" }}
            unit="ms"
          />
          <span className="adv-label-sm">
            {formatDurationSummary(settings)}
          </span>
        </div>
      )}
    </div>
  );
}
