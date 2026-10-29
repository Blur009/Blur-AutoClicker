import { memo, useCallback, useMemo, useState } from "react";
import type { CSSProperties, ChangeEvent, FocusEvent, WheelEvent } from "react";
import type { RateInputMode, Settings } from "../../store";
import {
  convertDurationToRate,
  convertRateToDuration,
  type CadenceDurationFields,
} from "../../cadence";
import { normalizeDecimalRaw } from "../../numberInput";
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
  commitDecimalText,
  inRangeDecimalValue,
  dynamicChWidth,
  handleDurationBlur,
  handleDurationWheelStep,
  handleDecimalBlur,
  handleNumberBlur,
  handleNumberChange,
  handleWheelStep,
  switchCadenceMode,
  wheelBaseValue,
} from "../sharedCadence";

const DurationField = memo(function DurationField({
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
});

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export default function SimpleCadenceInput({ settings, update }: Props) {
  const maxClickSpeed = useMemo(
    () => getMaxClickSpeed(settings.extendedClickSpeedLimit),
    [settings.extendedClickSpeedLimit],
  );
  const minIntervalMs = useMemo(
    () => getMinIntervalMs(settings.extendedClickSpeedLimit),
    [settings.extendedClickSpeedLimit],
  );
  const [draftCps, setDraftCps] = useState<string | null>(null);

  const updateSimpleCadence = useCallback(
    (patch: Partial<Settings>) => {
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
    },
    [settings, update],
  );

  const handleClickSpeedUpdate = useCallback(
    (next: number) => updateSimpleCadence({ clickSpeed: next }),
    [updateSimpleCadence],
  );

  const handleClickIntervalChange = useCallback(
    (value: string) =>
      updateSimpleCadence({ clickInterval: value as ClickInterval }),
    [updateSimpleCadence],
  );

  const handleRateModeChange = useCallback(
    (value: string) =>
      switchCadenceMode(value as RateInputMode, settings, update),
    [settings, update],
  );

  const handleCpsBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      setDraftCps(null);
      handleDecimalBlur(event, 1, maxClickSpeed, handleClickSpeedUpdate);
    },
    [maxClickSpeed, handleClickSpeedUpdate],
  );

  const handleCpsChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      const normalized = normalizeDecimalRaw(raw);
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

  const handleDurationHoursChange = useCallback(
    (next: number) => updateSimpleCadence({ durationHours: next }),
    [updateSimpleCadence],
  );
  const handleDurationMinutesChange = useCallback(
    (next: number) => updateSimpleCadence({ durationMinutes: next }),
    [updateSimpleCadence],
  );
  const handleDurationSecondsChange = useCallback(
    (next: number) => updateSimpleCadence({ durationSeconds: next }),
    [updateSimpleCadence],
  );
  const handleDurationMsChange = useCallback(
    (next: number) => updateSimpleCadence({ durationMilliseconds: next }),
    [updateSimpleCadence],
  );

  const durationSnapshot = useMemo(
    () =>
      ({
        durationHours: settings.durationHours,
        durationMinutes: settings.durationMinutes,
        durationSeconds: settings.durationSeconds,
        durationMilliseconds: settings.durationMilliseconds,
      }) as CadenceDurationFields,
    [
      settings.durationHours,
      settings.durationMinutes,
      settings.durationSeconds,
      settings.durationMilliseconds,
    ],
  );

  const handleDurationHoursBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) =>
      handleDurationBlur(
        event,
        "durationHours",
        0,
        999,
        durationSnapshot,
        updateSimpleCadence,
      ),
    [durationSnapshot, updateSimpleCadence],
  );

  const handleDurationHoursWheel = useCallback(
    (event: WheelEvent<HTMLInputElement>) =>
      handleDurationWheelStep(
        event,
        "durationHours",
        durationSnapshot,
        0,
        999,
        updateSimpleCadence,
      ),
    [durationSnapshot, updateSimpleCadence],
  );

  const handleDurationMinutesBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) =>
      handleDurationBlur(
        event,
        "durationMinutes",
        0,
        59,
        durationSnapshot,
        updateSimpleCadence,
      ),
    [durationSnapshot, updateSimpleCadence],
  );

  const handleDurationMinutesWheel = useCallback(
    (event: WheelEvent<HTMLInputElement>) =>
      handleDurationWheelStep(
        event,
        "durationMinutes",
        durationSnapshot,
        0,
        59,
        updateSimpleCadence,
      ),
    [durationSnapshot, updateSimpleCadence],
  );

  const handleDurationSecondsBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) =>
      handleDurationBlur(
        event,
        "durationSeconds",
        0,
        59,
        durationSnapshot,
        updateSimpleCadence,
      ),
    [durationSnapshot, updateSimpleCadence],
  );

  const handleDurationSecondsWheel = useCallback(
    (event: WheelEvent<HTMLInputElement>) =>
      handleDurationWheelStep(
        event,
        "durationSeconds",
        durationSnapshot,
        0,
        59,
        updateSimpleCadence,
      ),
    [durationSnapshot, updateSimpleCadence],
  );

  const handleDurationMsBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) =>
      handleDurationBlur(
        event,
        "durationMilliseconds",
        minIntervalMs,
        999,
        durationSnapshot,
        updateSimpleCadence,
      ),
    [durationSnapshot, minIntervalMs, updateSimpleCadence],
  );

  const handleDurationMsWheel = useCallback(
    (event: WheelEvent<HTMLInputElement>) =>
      handleDurationWheelStep(
        event,
        "durationMilliseconds",
        durationSnapshot,
        minIntervalMs,
        999,
        updateSimpleCadence,
      ),
    [durationSnapshot, minIntervalMs, updateSimpleCadence],
  );

  const hoursStyle = useMemo(
    () =>
      ({
        width: dynamicChWidth(settings.durationHours, 1, 3),
        minWidth: "1ch",
      }) as CSSProperties,
    [settings.durationHours],
  );
  const minutesStyle = useMemo(
    () =>
      ({
        width: dynamicChWidth(settings.durationMinutes, 1, 2),
        minWidth: "1ch",
      }) as CSSProperties,
    [settings.durationMinutes],
  );
  const secondsStyle = useMemo(
    () =>
      ({
        width: dynamicChWidth(settings.durationSeconds, 1, 2),
        minWidth: "1ch",
      }) as CSSProperties,
    [settings.durationSeconds],
  );
  const msStyle = useMemo(
    () =>
      ({
        width: dynamicChWidth(settings.durationMilliseconds, 1, 3),
        minWidth: "1ch",
      }) as CSSProperties,
    [settings.durationMilliseconds],
  );

  return (
    <div className="InputBox cadence-box simple-cadence-box">
      {settings.rateInputMode === "rate" ? (
        <div className="simple-cadence-row">
          <input
            type="text"
            inputMode="decimal"
            className="simple-inline-input simple-cadence-input"
            value={draftCps ?? settings.clickSpeed}
            aria-label="Clicks Per"
            onChange={handleCpsChange}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              setDraftCps(null);
              commitDecimalText(
                event.currentTarget.value,
                1,
                maxClickSpeed,
                handleClickSpeedUpdate,
              );
            }}
            onBlur={handleCpsBlur}
            onWheel={handleCpsWheel}
          />
          <div className="vertical-devider vertical-devider--stretch" />
          <span className="simple-control-label">Clicks Per</span>
          <div className="vertical-devider vertical-devider--stretch" />
          <AdvDropdown
            value={settings.clickInterval}
            options={INTERVAL_OPTIONS}
            allowWindowOverflow
            onChange={handleClickIntervalChange}
          />
          <div className="vertical-devider vertical-devider--stretch" />
          <AdvDropdown
            value={settings.rateInputMode}
            options={SIMPLE_RATE_INPUT_MODE_OPTIONS}
            allowWindowOverflow
            onChange={handleRateModeChange}
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
              onChange={handleDurationHoursChange}
              onBlur={handleDurationHoursBlur}
              onWheel={handleDurationHoursWheel}
              style={hoursStyle}
              unit="h"
            />
            <DurationField
              className="simple-duration-chip"
              value={settings.durationMinutes}
              min={0}
              max={59}
              onChange={handleDurationMinutesChange}
              onBlur={handleDurationMinutesBlur}
              onWheel={handleDurationMinutesWheel}
              style={minutesStyle}
              unit="m"
            />
            <DurationField
              className="simple-duration-chip"
              value={settings.durationSeconds}
              min={0}
              max={59}
              onChange={handleDurationSecondsChange}
              onBlur={handleDurationSecondsBlur}
              onWheel={handleDurationSecondsWheel}
              style={secondsStyle}
              unit="s"
            />
            <DurationField
              className="simple-duration-chip"
              value={settings.durationMilliseconds}
              min={minIntervalMs}
              max={999}
              onChange={handleDurationMsChange}
              onBlur={handleDurationMsBlur}
              onWheel={handleDurationMsWheel}
              style={msStyle}
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
            onChange={handleRateModeChange}
          />
        </div>
      )}
    </div>
  );
}
