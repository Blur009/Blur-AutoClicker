import type { RateInputMode, Settings } from "./store";
import type { ClickInterval } from "./settingsSchema";

type CadenceSettings = Pick<
  Settings,
  | "clickSpeed"
  | "clickInterval"
  | "rateInputMode"
  | "durationHours"
  | "durationMinutes"
  | "durationSeconds"
  | "durationMilliseconds"
>;

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

export function getDurationTotalMs(settings: CadenceSettings): number {
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
    const speed = Math.max(1, Math.min(500, Math.round(intervalMs / totalMs)));
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

export function getMaxDoubleClickDelayMs(settings: CadenceSettings): number {
  const cps = Math.min(getEffectiveClicksPerSecond(settings), 50);
  return cps > 0 ? Math.max(20, Math.floor(1000 / cps) - 2) : 9999;
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
