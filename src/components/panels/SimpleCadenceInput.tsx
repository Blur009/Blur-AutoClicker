import { useState } from "react";
import type { CSSProperties } from "react";
import type { RateInputMode, Settings } from "../../store";
import { convertDurationToRate, convertRateToDuration } from "../../cadence";
import { normalizeIntegerRaw } from "../../numberInput";
import { getMaxClickSpeed, type ClickInterval } from "../../settingsSchema";
import { AdvDropdown } from "./advanced/sections/shared";
import "./advanced/AdvancedPanel.css";
import {
  INTERVAL_OPTIONS,
  SIMPLE_RATE_INPUT_MODE_OPTIONS,
  dynamicChWidth,
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
              onChange={(next) =>
                updateSimpleCadence({ durationMilliseconds: next })
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
