import { useState } from "react";
import type { CSSProperties, FocusEvent, WheelEvent } from "react";
import type { RateInputMode, Settings } from "../../store";
import {
  convertDurationToRate,
  convertRateToDuration,
  type CadenceDurationFields,
} from "../../cadence";
import { normalizeIntegerRaw } from "../../numberInput";
import {
  getMaxClickSpeed,
  getMinIntervalMs,
  type ClickInterval,
} from "../../settingsSchema";
import { AdvDropdown } from "./advanced/sections/shared";
import "./advanced/AdvancedPanel.css";
import {
  INTERVAL_OPTIONS,
  SIMPLE_RATE_INPUT_MODE_OPTIONS,
  dynamicChWidth,
  handleDurationBlur,
  handleDurationWheelStep,
  handleNumberBlur,
  handleNumberChange,
  handleWheelStep,
  switchCadenceMode,
} from "../sharedCadence";

function DurationField({
  value,
  min,
  max,
  onChange,
  onBlur,
  onWheel,
  style,
  unit,
  className,
}: {
  value: number;
  min: number;
  max?: number;
  onChange: (next: number) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  onWheel?: (event: WheelEvent<HTMLInputElement>) => void;
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
        onBlur={(event) =>
          onBlur ? onBlur(event) : handleNumberBlur(event, min, max, onChange)
        }
        onWheel={(event) =>
          onWheel
            ? onWheel(event)
            : handleWheelStep(event, value, min, max, onChange)
        }
        style={style}
      />
      <span className={className ? "postfix" : "adv-unit"}>{unit}</span>
    </div>
  );
}

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export default function SimpleCadenceInput({ settings, update }: Props) {
  const maxClickSpeed = getMaxClickSpeed(settings.extendedClickSpeedLimit);
  const [draftCps, setDraftCps] = useState<string | null>(null);

  const updateSimpleCadence = (patch: Partial<Settings>) => {
    const nextSettings = { ...settings, ...patch };

    if (nextSettings.rateInputMode === "rate") {
      const converted = convertRateToDuration(nextSettings);
      update({
        ...patch,
        ...(converted ?? {}),
      });
      return;
    }

    const converted = convertDurationToRate(nextSettings);
    update({
      ...patch,
      ...(converted ?? {}),
    });
  };

  return (
    <div className="InputBox cadence-box simple-cadence-box">
      {settings.rateInputMode === "rate" ? (
        <div className="simple-cadence-row">
          <input
            type="number"
            className="simple-inline-input simple-cadence-input"
            value={draftCps ?? settings.clickSpeed}
            min={1}
            max={maxClickSpeed}
            aria-label="Clicks Per"
            onChange={(event) => {
              const raw = event.target.value;
              if (raw === "") {
                setDraftCps("");
              } else {
                const normalized = normalizeIntegerRaw(raw);
                if (normalized !== raw) event.target.value = normalized;
                if (normalized === "" || normalized === "-") {
                  setDraftCps(normalized);
                  return;
                }
                setDraftCps(null);
                updateSimpleCadence({ clickSpeed: Number(normalized) });
              }
            }}
            onBlur={(event) => {
              setDraftCps(null);
              handleNumberBlur(event, 1, maxClickSpeed, (next) =>
                updateSimpleCadence({ clickSpeed: next }),
              );
            }}
            onWheel={(event) =>
              handleWheelStep(
                event,
                settings.clickSpeed,
                1,
                maxClickSpeed,
                (next) => updateSimpleCadence({ clickSpeed: next }),
              )
            }
          />
          <div className="vertical-devider vertical-devider--stretch" />
          <span className="simple-control-label">Clicks Per</span>
          <div className="vertical-devider vertical-devider--stretch" />
          <AdvDropdown
            value={settings.clickInterval}
            options={INTERVAL_OPTIONS}
            allowWindowOverflow
            onChange={(value) =>
              updateSimpleCadence({ clickInterval: value as ClickInterval })
            }
          />
          <div className="vertical-devider vertical-devider--stretch" />
          <AdvDropdown
            value={settings.rateInputMode}
            options={SIMPLE_RATE_INPUT_MODE_OPTIONS}
            allowWindowOverflow
            onChange={(value) =>
              switchCadenceMode(value as RateInputMode, settings, update)
            }
          />
        </div>
      ) : (
        <div className="simple-cadence-row">
          <div className="simple-duration-group">
            <DurationField
              className="simple-duration-chip"
              value={settings.durationHours}
              min={0}
              max={999}
              onChange={(next) => updateSimpleCadence({ durationHours: next })}
              onBlur={(event) =>
                handleDurationBlur(
                  event,
                  "durationHours",
                  0,
                  999,
                  settings as CadenceDurationFields,
                  (patch) => updateSimpleCadence(patch),
                )
              }
              onWheel={(event) =>
                handleDurationWheelStep(
                  event,
                  "durationHours",
                  settings as CadenceDurationFields,
                  0,
                  999,
                  (patch) => updateSimpleCadence(patch),
                )
              }
              style={{
                width: dynamicChWidth(settings.durationHours, 1, 3),
                minWidth: "1ch",
              }}
              unit="h"
            />
            <DurationField
              className="simple-duration-chip"
              value={settings.durationMinutes}
              min={0}
              max={59}
              onChange={(next) =>
                updateSimpleCadence({ durationMinutes: next })
              }
              onBlur={(event) =>
                handleDurationBlur(
                  event,
                  "durationMinutes",
                  0,
                  59,
                  settings as CadenceDurationFields,
                  (patch) => updateSimpleCadence(patch),
                )
              }
              onWheel={(event) =>
                handleDurationWheelStep(
                  event,
                  "durationMinutes",
                  settings as CadenceDurationFields,
                  0,
                  59,
                  (patch) => updateSimpleCadence(patch),
                )
              }
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
              onChange={(next) =>
                updateSimpleCadence({ durationSeconds: next })
              }
              onBlur={(event) =>
                handleDurationBlur(
                  event,
                  "durationSeconds",
                  0,
                  59,
                  settings as CadenceDurationFields,
                  (patch) => updateSimpleCadence(patch),
                )
              }
              onWheel={(event) =>
                handleDurationWheelStep(
                  event,
                  "durationSeconds",
                  settings as CadenceDurationFields,
                  0,
                  59,
                  (patch) => updateSimpleCadence(patch),
                )
              }
              style={{
                width: dynamicChWidth(settings.durationSeconds, 1, 2),
                minWidth: "1ch",
              }}
              unit="s"
            />
            <DurationField
              className="simple-duration-chip"
              value={settings.durationMilliseconds}
              min={getMinIntervalMs(settings.extendedClickSpeedLimit)}
              max={999}
              onChange={(next) =>
                updateSimpleCadence({ durationMilliseconds: next })
              }
              onBlur={(event) =>
                handleDurationBlur(
                  event,
                  "durationMilliseconds",
                  getMinIntervalMs(settings.extendedClickSpeedLimit),
                  999,
                  settings as CadenceDurationFields,
                  (patch) => updateSimpleCadence(patch),
                )
              }
              onWheel={(event) =>
                handleDurationWheelStep(
                  event,
                  "durationMilliseconds",
                  settings as CadenceDurationFields,
                  getMinIntervalMs(settings.extendedClickSpeedLimit),
                  999,
                  (patch) => updateSimpleCadence(patch),
                )
              }
              style={{
                width: dynamicChWidth(settings.durationMilliseconds, 1, 3),
                minWidth: "1ch",
              }}
              unit="ms"
            />
          </div>
          <div className="vertical-devider vertical-devider--stretch" />
          <span className="simple-control-label">Per Click</span>
          <div className="vertical-devider vertical-devider--stretch" />
          <AdvDropdown
            value={settings.rateInputMode}
            options={SIMPLE_RATE_INPUT_MODE_OPTIONS}
            allowWindowOverflow
            onChange={(value) =>
              switchCadenceMode(value as RateInputMode, settings, update)
            }
          />
        </div>
      )}
    </div>
  );
}
