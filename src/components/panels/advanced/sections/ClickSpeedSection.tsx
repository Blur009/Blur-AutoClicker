import { useState, type WheelEvent, type FocusEvent } from "react";
import type { Settings } from "../../../../store";
import { normalizeIntegerRaw } from "../../../../numberInput";
import {
  convertDurationToRate,
  formatIntervalMs,
  getIntervalMilliseconds,
  type CadenceDurationFields,
} from "../../../../cadence";
import {
  switchCadenceMode,
  SIMPLE_RATE_INPUT_MODE_OPTIONS,
} from "../../../sharedCadence";
import {
  getMaxClickSpeed,
  getMinIntervalMs,
  type ClickInterval,
} from "../../../../settingsSchema";
import { AdvDropdown, CardDivider, Disableable } from "./shared";
import {
  INTERVAL_OPTIONS,
  handleDurationBlur,
  handleDurationWheelStep,
  handleNumberBlur,
  handleNumberChange,
  handleWheelStep,
} from "../../../sharedCadence";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export default function ClickSpeedSection({ settings, update }: Props) {
  const maxClickSpeed = getMaxClickSpeed(settings.extendedClickSpeedLimit);
  const [draftCps, setDraftCps] = useState<string | null>(null);

  const conversionText = (() => {
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
    return `${converted.clickSpeed} clicks per ${unitLabel.toLowerCase()}`;
  })();

  return (
    <div className="adv-sectioncontainer adv-basic-card">
      <div className="adv-card-header">
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span style={{ color: "var(--text-dim)" }}>
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
              onClick={() => switchCadenceMode(value, settings, update)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <Disableable
        enabled={settings.dutyCycleMode !== "Hold"}
        disabledReason="Click speed is disabled in Hold mode"
      >
        <CardDivider />
        <div className="adv-card-desc">
          Changes how fast the autoclicker clicks.
        </div>
        <div className="adv-cadence-block">
          <div className="adv-row adv-cadence-main-row">
            <div className="adv-cadence-value">
              {settings.rateInputMode === "rate" ? (
                <div className="adv-value-outline">
                  <div className="adv-foc">
                    <input
                      type="number"
                      className="adv-number-sm"
                      value={draftCps ?? settings.clickSpeed}
                      min={1}
                      max={maxClickSpeed}
                      style={{ width: "2.5rem", textAlign: "right" }}
                      onChange={(event) => {
                        const raw = event.target.value;
                        if (raw === "") {
                          setDraftCps("");
                        } else {
                          const normalized = normalizeIntegerRaw(raw);
                          if (normalized !== raw)
                            event.target.value = normalized;
                          if (normalized === "" || normalized === "-") {
                            setDraftCps(normalized);
                            return;
                          }
                          setDraftCps(null);
                          update({ clickSpeed: Number(normalized) });
                        }
                      }}
                      onBlur={(event) => {
                        setDraftCps(null);
                        handleNumberBlur(event, 1, maxClickSpeed, (next) =>
                          update({ clickSpeed: next }),
                        );
                      }}
                      onWheel={(event) =>
                        handleWheelStep(
                          event,
                          settings.clickSpeed,
                          1,
                          maxClickSpeed,
                          (next) => update({ clickSpeed: next }),
                        )
                      }
                    />
                  </div>
                  <div className="adv-vdivider" />
                  <span className="adv-unf">Clicks Per</span>
                  <div className="adv-vdivider" />
                  <div className="adv-foc adv-foc-grow">
                    <AdvDropdown
                      value={settings.clickInterval}
                      options={INTERVAL_OPTIONS}
                      onChange={(v) =>
                        update({ clickInterval: v as ClickInterval })
                      }
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
                      style={{ width: "34px", textAlign: "right" }}
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
                          (patch) => update(patch),
                        )
                      }
                      onWheel={(event: WheelEvent<HTMLInputElement>) =>
                        handleDurationWheelStep(
                          event,
                          "durationHours",
                          settings as CadenceDurationFields,
                          0,
                          999,
                          (patch) => update(patch),
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
                      style={{ width: "26px", textAlign: "right" }}
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
                          (patch) => update(patch),
                        )
                      }
                      onWheel={(event: WheelEvent<HTMLInputElement>) =>
                        handleDurationWheelStep(
                          event,
                          "durationMinutes",
                          settings as CadenceDurationFields,
                          0,
                          59,
                          (patch) => update(patch),
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
                      style={{ width: "26px", textAlign: "right" }}
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
                          (patch) => update(patch),
                        )
                      }
                      onWheel={(event: WheelEvent<HTMLInputElement>) =>
                        handleDurationWheelStep(
                          event,
                          "durationSeconds",
                          settings as CadenceDurationFields,
                          0,
                          59,
                          (patch) => update(patch),
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
                      min={getMinIntervalMs(settings.extendedClickSpeedLimit)}
                      max={999}
                      style={{ width: "34px", textAlign: "right" }}
                      onChange={(event) =>
                        handleNumberChange(event, (next) =>
                          update({ durationMilliseconds: next }),
                        )
                      }
                      onBlur={(event: FocusEvent<HTMLInputElement>) =>
                        handleDurationBlur(
                          event,
                          "durationMilliseconds",
                          getMinIntervalMs(settings.extendedClickSpeedLimit),
                          999,
                          settings as CadenceDurationFields,
                          (patch) => update(patch),
                        )
                      }
                      onWheel={(event: WheelEvent<HTMLInputElement>) =>
                        handleDurationWheelStep(
                          event,
                          "durationMilliseconds",
                          settings as CadenceDurationFields,
                          getMinIntervalMs(settings.extendedClickSpeedLimit),
                          999,
                          (patch) => update(patch),
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
