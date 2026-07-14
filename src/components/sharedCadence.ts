import type { ChangeEvent, FocusEvent, WheelEvent } from "react";
import { normalizeIntegerRaw } from "../numberInput";
import {
  convertDurationToRate,
  convertRateToDuration,
  overflowDurationField,
} from "../cadence";
import type { CadenceDurationFields } from "../cadence";
import type { RateInputMode, Settings } from "../store";

export const INTERVAL_OPTIONS = [
  { value: "s", label: "Second" },
  { value: "m", label: "Minute" },
  { value: "h", label: "Hour" },
  { value: "d", label: "Day" },
] as const;

export const SIMPLE_RATE_INPUT_MODE_OPTIONS = [
  { value: "rate", label: "Rate" },
  { value: "duration", label: "Interval" },
] as const;

export function parseIntegerRaw(raw: string) {
  const normalized = normalizeIntegerRaw(raw);
  return normalized === "" || normalized === "-" ? 0 : Number(normalized);
}

export function clamp(value: number, min: number, max?: number) {
  const minClamped = Math.max(min, value);
  return max === undefined ? minClamped : Math.min(max, minClamped);
}

export function dynamicChWidth(value: number, min = 1, max = 3) {
  return `${clamp(String(Math.abs(value)).length, min, max)}ch`;
}

export function handleWheelStep(
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
  let step = 1;
  if (event.shiftKey && event.ctrlKey) step = 100;
  else if (event.ctrlKey) step = 25;
  else if (event.shiftKey) step = 5;
  apply(clamp(current + delta * step, min, max));
}

export function handleNumberChange(
  event: ChangeEvent<HTMLInputElement>,
  apply: (next: number) => void,
) {
  const normalized = normalizeIntegerRaw(event.target.value);
  if (normalized !== event.target.value) {
    event.target.value = normalized;
  }
  apply(parseIntegerRaw(normalized));
}

export function switchCadenceMode(
  mode: RateInputMode,
  settings: Settings,
  update: (patch: Partial<Settings>) => void,
) {
  if (mode === settings.rateInputMode) return;

  if (mode === "rate") {
    const converted = convertDurationToRate(settings);
    update({
      rateInputMode: mode,
      ...(converted ?? {}),
    });
    return;
  }

  const converted = convertRateToDuration(settings);
  update({
    rateInputMode: mode,
    ...(converted ?? {}),
  });
}

export function handleNumberBlur(
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

export function handleDurationBlur(
  event: FocusEvent<HTMLInputElement>,
  field: keyof CadenceDurationFields,
  min: number,
  max: number | undefined,
  current: CadenceDurationFields,
  apply: (patch: Partial<CadenceDurationFields>) => void,
) {
  const normalized = normalizeIntegerRaw(event.target.value);
  if (normalized !== event.target.value) {
    event.target.value = normalized;
  }
  const value = parseIntegerRaw(normalized);

  if (max !== undefined && value > max && field !== "durationHours") {
    const overflowed = overflowDurationField(field, value, current);
    if (overflowed) {
      apply(overflowed);
      return;
    }
  }

  apply({ [field]: clamp(value, min, max) });
}

export function handleDurationWheelStep(
  event: WheelEvent<HTMLInputElement>,
  field: keyof CadenceDurationFields,
  current: CadenceDurationFields,
  min: number,
  max: number | undefined,
  apply: (patch: Partial<CadenceDurationFields>) => void,
) {
  event.currentTarget.blur();
  event.preventDefault();
  event.stopPropagation();
  const delta = event.deltaY < 0 ? 1 : -1;
  let step = 1;
  if (event.shiftKey && event.ctrlKey) step = 100;
  else if (event.ctrlKey) step = 25;
  else if (event.shiftKey) step = 5;

  const next = current[field] + delta * step;

  if (max !== undefined && next > max && field !== "durationHours") {
    const overflowed = overflowDurationField(field, next, current);
    if (overflowed) {
      apply(overflowed);
      return;
    }
  }

  apply({ [field]: clamp(next, min, max) });
}
