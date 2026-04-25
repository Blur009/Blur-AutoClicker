import type { RateInputMode, Settings } from "./store";

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

export const RATE_INPUT_MODE_OPTIONS: RateInputMode[] = ["rate", "duration"];

export function getDurationTotalMs(settings: CadenceSettings): number {
  return (
    settings.durationHours * 3_600_000 +
    settings.durationMinutes * 60_000 +
    settings.durationSeconds * 1_000 +
    settings.durationMilliseconds
  );
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

export function formatMillisecondsSummary(totalMs: number): string {
  const roundedMs = Math.max(1, Math.round(totalMs));
  const hours = Math.floor(roundedMs / 3_600_000);
  const remainderAfterHours = roundedMs % 3_600_000;
  const minutes = Math.floor(remainderAfterHours / 60_000);
  const remainderAfterMinutes = remainderAfterHours % 60_000;
  const seconds = Math.floor(remainderAfterMinutes / 1_000);
  const milliseconds = remainderAfterMinutes % 1_000;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (seconds > 0) {
    parts.push(`${seconds}s`);
  }
  if (milliseconds > 0 || parts.length === 0) {
    parts.push(`${milliseconds}ms`);
  }

  return parts.join(" ");
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
