import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type WheelEvent,
  type FocusEvent,
} from "react";
import type { Settings } from "../../../../store";
import {
  formatDecimalLocale,
  normalizeDecimalLocale,
} from "../../../../numberInput";
import {
  convertDurationToRate,
  formatIntervalMs,
  getIntervalMilliseconds,
  type CadenceDurationFields,
} from "../../../../cadence";
import {
  switchCadenceMode,
  SIMPLE_RATE_INPUT_MODE_OPTIONS,
  commitDecimalLocaleText,
  inRangeDecimalValue,
  handleDurationBlur,
  handleDurationWheelStep,
  handleDecimalBlurLocale,
  handleNumberChange,
  handleWheelStep,
  INTERVAL_OPTIONS,
  wheelBaseValue,
} from "../../../sharedCadence";
import {
  getMaxClickSpeed,
  getMinIntervalMs,
  type ClickInterval,
} from "../../../../settingsSchema";
import { AdvDropdown, CardDivider, Disableable } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const HEADER_ROW_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
};

const HEADER_ICON_STYLE: CSSProperties = { color: "var(--text-dim)" };

const CPS_INPUT_STYLE: CSSProperties = { width: "5ch", textAlign: "right" };

const DURATION_WIDE_INPUT_STYLE: CSSProperties = {
  width: "34px",
  textAlign: "right",
};

const DURATION_NARROW_INPUT_STYLE: CSSProperties = {
  width: "26px",
  textAlign: "right",
};

export default function ClickSpeedSection({ settings, update }: Props) {
  const maxClickSpeed = useMemo(
    () => getMaxClickSpeed(settings.extendedClickSpeedLimit),
    [settings.extendedClickSpeedLimit],
  );
  const minIntervalMs = useMemo(
    () => getMinIntervalMs(settings.extendedClickSpeedLimit),
    [settings.extendedClickSpeedLimit],
  );
  const [draftCps, setDraftCps] = useState<string | null>(null);

  const conversionText = useMemo(() => {
    if (settings.rateInputMode === "rate") {
      const intervalMs =
        getIntervalMilliseconds(settings.clickInterval) / settings.clickSpeed;
      if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null;
      return `${formatIntervalMs(intervalMs)} Interval`;
    }
    const converted = convertDurationToRate(settings);
    if (!converted) return null;
    const unitLabel =
      INTERVAL_OPTIONS.find((o) => o.value === converted.clickInterval)
        ?.label || "Second";
    return `${formatDecimalLocale(converted.clickSpeed)} clicks per ${unitLabel.toLowerCase()}`;
  }, [settings]);

  const handleClickSpeedUpdate = useCallback(
    (next: number) => update({ clickSpeed: next }),
    [update],
  );

  const handleClickIntervalChange = useCallback(
    (v: string) => update({ clickInterval: v as ClickInterval }),
    [update],
  );

  const applyPatch = useCallback(
    (patch: Partial<Settings>) => update(patch),
    [update],
  );

  const handleRateModeSelect = useCallback(
    (value: Settings["rateInputMode"]) =>
      switchCadenceMode(value, settings, update),
    [settings, update],
  );

  const handleCpsChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      const normalized = normalizeDecimalLocale(raw);
      if (normalized !== raw) event.target.value = normalized;
      setDraftCps(normalized);
      const typed = inRangeDecimalValue(normalized, 1, maxClickSpeed);
      if (typed !== null) handleClickSpeedUpdate(typed);
    },
    [maxClickSpeed, handleClickSpeedUpdate],
  );

  const handleCpsWheel = useCallback(
    (event: WheelEvent<HTMLInputElement>) =>
      handleWheelStep(
        event,
        wheelBaseValue(draftCps, settings.clickSpeed, 1),
        1,
        maxClickSpeed,
        handleClickSpeedUpdate,
      ),
    [draftCps, settings.clickSpeed, maxClickSpeed, handleClickSpeedUpdate],
  );

  return (
    <div className="adv-sectioncontainer adv-basic-card">
      <div className="adv-card-header">
        <div style={HEADER_ROW_STYLE}>
          <span style={HEADER_ICON_STYLE}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M7 2v11h3v9l7-12h-4l4-8z" />
            </svg>
          </span>
          <span className="adv-card-title">Click Speed</span>
        </div>
        <div className="adv-seg-group">
          {SIMPLE_RATE_INPUT_MODE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`adv-seg-btn ${settings.rateInputMode === value ? "active" : ""}`}
              onClick={() => handleRateModeSelect(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <Disableable
        enabled={settings.dutyCycleMode !== "Hold"}
        disabledReason="Hold mode holds the button or key down, so click speed does not apply."
      >
        <CardDivider />
        <div className="adv-card-desc">
          {settings.rateInputMode === "rate"
            ? "Sets how many clicks happen per second, minute, hour, or day."
            : "Sets the delay between one click and the next."}
        </div>
        <div className="adv-cadence-block">
          <div className="adv-row adv-cadence-main-row">
            <div className="adv-cadence-value">
              {settings.rateInputMode === "rate" ? (
                <div className="adv-value-outline">
                  <div className="adv-foc">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="adv-number-sm"
                      value={
                        draftCps ?? formatDecimalLocale(settings.clickSpeed)
                      }
                      style={CPS_INPUT_STYLE}
                      onChange={handleCpsChange}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        setDraftCps(null);
                        commitDecimalLocaleText(
                          event.currentTarget.value,
                          1,
                          maxClickSpeed,
                          handleClickSpeedUpdate,
                        );
                      }}
                      onBlur={(event) => {
                        setDraftCps(null);
                        handleDecimalBlurLocale(
                          event,
                          1,
                          maxClickSpeed,
                          handleClickSpeedUpdate,
                        );
                      }}
                      onWheel={handleCpsWheel}
                    />
                  </div>
                  <div className="adv-vdivider" />
                  <span className="adv-unf">Clicks Per</span>
                  <div className="adv-vdivider" />
                  <div className="adv-foc adv-foc-grow">
                    <AdvDropdown
                      value={settings.clickInterval}
                      options={INTERVAL_OPTIONS}
                      onChange={handleClickIntervalChange}
                    />
                  </div>
                </div>
              ) : (
                <div className="adv-value-outline adv-value-outline--duration">
                  <div className="adv-foc">
                    <input
                      type="number"
                      className="adv-number-sm"
                      value={settings.durationHours}
                      min={0}
                      max={999}
                      style={DURATION_WIDE_INPUT_STYLE}
                      onChange={(event) =>
                        handleNumberChange(event, (next) =>
                          update({ durationHours: next }),
                        )
                      }
                      onBlur={(event: FocusEvent<HTMLInputElement>) =>
                        handleDurationBlur(
                          event,
                          "durationHours",
                          0,
                          999,
                          settings as CadenceDurationFields,
                          applyPatch,
                        )
                      }
                      onWheel={(event: WheelEvent<HTMLInputElement>) =>
                        handleDurationWheelStep(
                          event,
                          "durationHours",
                          settings as CadenceDurationFields,
                          0,
                          999,
                          applyPatch,
                        )
                      }
                    />
                    <span className="adv-unit">h</span>
                  </div>
                  <div className="adv-vdivider" />
                  <div className="adv-foc">
                    <input
                      type="number"
                      className="adv-number-sm"
                      value={settings.durationMinutes}
                      min={0}
                      max={59}
                      style={DURATION_NARROW_INPUT_STYLE}
                      onChange={(event) =>
                        handleNumberChange(event, (next) =>
                          update({ durationMinutes: next }),
                        )
                      }
                      onBlur={(event: FocusEvent<HTMLInputElement>) =>
                        handleDurationBlur(
                          event,
                          "durationMinutes",
                          0,
                          59,
                          settings as CadenceDurationFields,
                          applyPatch,
                        )
                      }
                      onWheel={(event: WheelEvent<HTMLInputElement>) =>
                        handleDurationWheelStep(
                          event,
                          "durationMinutes",
                          settings as CadenceDurationFields,
                          0,
                          59,
                          applyPatch,
                        )
                      }
                    />
                    <span className="adv-unit">m</span>
                  </div>
                  <div className="adv-vdivider" />
                  <div className="adv-foc">
                    <input
                      type="number"
                      className="adv-number-sm"
                      value={settings.durationSeconds}
                      min={0}
                      max={59}
                      style={DURATION_NARROW_INPUT_STYLE}
                      onChange={(event) =>
                        handleNumberChange(event, (next) =>
                          update({ durationSeconds: next }),
                        )
                      }
                      onBlur={(event: FocusEvent<HTMLInputElement>) =>
                        handleDurationBlur(
                          event,
                          "durationSeconds",
                          0,
                          59,
                          settings as CadenceDurationFields,
                          applyPatch,
                        )
                      }
                      onWheel={(event: WheelEvent<HTMLInputElement>) =>
                        handleDurationWheelStep(
                          event,
                          "durationSeconds",
                          settings as CadenceDurationFields,
                          0,
                          59,
                          applyPatch,
                        )
                      }
                    />
                    <span className="adv-unit">s</span>
                  </div>
                  <div className="adv-vdivider" />
                  <div className="adv-foc">
                    <input
                      type="number"
                      className="adv-number-sm"
                      value={settings.durationMilliseconds}
                      min={minIntervalMs}
                      max={999}
                      style={DURATION_WIDE_INPUT_STYLE}
                      onChange={(event) =>
                        handleNumberChange(event, (next) =>
                          update({ durationMilliseconds: next }),
                        )
                      }
                      onBlur={(event: FocusEvent<HTMLInputElement>) =>
                        handleDurationBlur(
                          event,
                          "durationMilliseconds",
                          minIntervalMs,
                          999,
                          settings as CadenceDurationFields,
                          applyPatch,
                        )
                      }
                      onWheel={(event: WheelEvent<HTMLInputElement>) =>
                        handleDurationWheelStep(
                          event,
                          "durationMilliseconds",
                          settings as CadenceDurationFields,
                          minIntervalMs,
                          999,
                          applyPatch,
                        )
                      }
                    />
                    <span className="adv-unit">ms</span>
                  </div>
                </div>
              )}
            </div>
            {conversionText && (
              <span className="adv-conversion-display">{conversionText}</span>
            )}
          </div>
        </div>
      </Disableable>
    </div>
  );
}
