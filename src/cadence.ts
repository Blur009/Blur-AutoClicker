import type { RateInputMode, Settings } from "./store";
import type { ClickInterval } from "./settingsSchema";
import { getMaxClickSpeed } from "./settingsSchema";

type CadenceSettings = Pick<
  Settings,
  | "clickSpeed"
  | "clickInterval"
  | "rateInputMode"
  | "durationHours"
  | "durationMinutes"
  | "durationSeconds"
  | "durationMilliseconds"
> & {
  extendedClickSpeedLimit?: boolean;
};

export type CadenceDurationFields = Pick<
  Settings,
  | "durationHours"
  | "durationMinutes"
  | "durationSeconds"
  | "durationMilliseconds"
>;

export type CadenceRateFields = Pick<Settings, "clickSpeed" | "clickInterval">;

export const RATE_INPUT_MODE_OPTIONS: RateInputMode[] = ["rate", "duration"];

const INTERVAL_MS: Record<ClickInterval, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function getDurationTotalMs(settings: CadenceDurationFields): number {
  return (
    settings.durationHours * 3_600_000 +
    settings.durationMinutes * 60_000 +
    settings.durationSeconds * 1_000 +
    settings.durationMilliseconds
  );
}

export function getIntervalMilliseconds(interval: ClickInterval): number {
  return INTERVAL_MS[interval] ?? 1_000;
}

export function decomposeMs(totalMs: number): CadenceDurationFields {
  const totalRounded = Math.round(totalMs);
  const hours = Math.floor(totalRounded / 3_600_000);
  const remainderAfterHours = totalRounded % 3_600_000;
  const minutes = Math.floor(remainderAfterHours / 60_000);
  const remainderAfterMinutes = remainderAfterHours % 60_000;
  const seconds = Math.floor(remainderAfterMinutes / 1_000);
  const milliseconds = remainderAfterMinutes % 1_000;

  return {
    durationHours: hours,
    durationMinutes: minutes,
    durationSeconds: seconds,
    durationMilliseconds: milliseconds,
  };
}

const FIELD_TO_MS: Record<keyof CadenceDurationFields, number> = {
  durationHours: 3_600_000,
  durationMinutes: 60_000,
  durationSeconds: 1_000,
  durationMilliseconds: 1,
};

export function overflowDurationField(
  field: keyof CadenceDurationFields,
  rawValue: number,
  current: CadenceDurationFields,
): CadenceDurationFields | null {
  const multiplier = FIELD_TO_MS[field];
  const oldTotal = getDurationTotalMs(current);
  const oldMs = current[field] * multiplier;
  const newMs = rawValue * multiplier;
  const newTotal = oldTotal - oldMs + newMs;
  if (newTotal === oldTotal) return null;
  return decomposeMs(Math.max(0, newTotal));
}

export function convertRateToDuration(
  settings: CadenceSettings,
): CadenceDurationFields | null {
  if (!Number.isFinite(settings.clickSpeed) || settings.clickSpeed <= 0) {
    return null;
  }

  const intervalMs = getIntervalMilliseconds(settings.clickInterval);
  const totalMs = intervalMs / settings.clickSpeed;
  if (!Number.isFinite(totalMs) || totalMs <= 0) {
    return null;
  }

  return decomposeMs(totalMs);
}

export function convertDurationToRate(
  settings: CadenceSettings,
): CadenceRateFields | null {
  const totalMs = getDurationTotalMs(settings);
  if (!Number.isFinite(totalMs) || totalMs <= 0) {
    return null;
  }

  const intervalCandidates: ClickInterval[] = ["s", "m", "h", "d"];
  let bestInterval: ClickInterval = "s";
  let bestSpeed = 1;
  let bestError = Number.POSITIVE_INFINITY;

  for (const interval of intervalCandidates) {
    const intervalMs = getIntervalMilliseconds(interval);
    const speed = Math.max(
      1,
      Math.min(
        getMaxClickSpeed(settings.extendedClickSpeedLimit),
        Math.round(intervalMs / totalMs),
      ),
    );
    const actualMs = intervalMs / speed;
    const error = Math.abs(actualMs - totalMs);

    if (error < bestError) {
      bestError = error;
      bestInterval = interval;
      bestSpeed = speed;
    }
  }

  return {
    clickSpeed: bestSpeed,
    clickInterval: bestInterval,
  };
}

export function getEffectiveIntervalMs(settings: CadenceSettings): number {
  if (settings.rateInputMode === "duration") {
    return Math.max(1, getDurationTotalMs(settings));
  }

  if (settings.clickSpeed <= 0) {
    return 1_000;
  }

  const intervalMs = (() => {
    switch (settings.clickInterval) {
      case "m":
        return 60_000 / settings.clickSpeed;
      case "h":
        return 3_600_000 / settings.clickSpeed;
      case "d":
        return 86_400_000 / settings.clickSpeed;
      default:
        return 1_000 / settings.clickSpeed;
    }
  })();

  return Math.max(1, intervalMs);
}

export function getEffectiveClicksPerSecond(settings: CadenceSettings): number {
  return 1_000 / getEffectiveIntervalMs(settings);
}

export function formatIntervalMs(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`;

  const totalSec = ms / 1000;
  const h = Math.floor(totalSec / 3600);

  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    if (rh > 0)
      return `${d} day${d > 1 ? "s" : ""} ${rh} hr${rh > 1 ? "s" : ""}`;
    return `${d} day${d > 1 ? "s" : ""}`;
  }

  const m = Math.floor((totalSec % 3600) / 60);

  if (h > 0) {
    if (m > 0) return `${h} hr${h > 1 ? "s" : ""} ${m} min${m > 1 ? "s" : ""}`;
    return `${h} hr${h > 1 ? "s" : ""}`;
  }

  if (m > 0) {
    const s = Math.round(totalSec % 60);
    if (s > 0) return `${m} min${m > 1 ? "s" : ""} ${s} sec${s > 1 ? "s" : ""}`;
    return `${m} min${m > 1 ? "s" : ""}`;
  }

  const s = +(totalSec % 60).toFixed(1);
  return `${s} sec${s > 1 ? "s" : ""}`;
}

export function isDoubleClickSupported(settings: CadenceSettings): boolean {
  return getEffectiveClicksPerSecond(settings) < 11;
}

export function formatDurationSummary(settings: CadenceSettings): string {
  const parts: string[] = [];

  if (settings.durationHours > 0) {
    parts.push(`${settings.durationHours}h`);
  }
  if (settings.durationMinutes > 0) {
    parts.push(`${settings.durationMinutes}m`);
  }
  if (settings.durationSeconds > 0) {
    parts.push(`${settings.durationSeconds}s`);
  }
  if (settings.durationMilliseconds > 0 || parts.length === 0) {
    parts.push(`${settings.durationMilliseconds}ms`);
  }

  return parts.join(" ");
}
