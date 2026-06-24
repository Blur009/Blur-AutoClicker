import type { Settings } from "./store";

export function formatTimerDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0",
  )}:${String(seconds).padStart(2, "0")}`;
}

export function timeLimitDurationMs(settings: Pick<Settings, "timeLimit" | "timeLimitUnit">): number {
  const value = Math.max(0, Number(settings.timeLimit) || 0);
  const seconds =
    settings.timeLimitUnit === "h"
      ? value * 3600
      : settings.timeLimitUnit === "m"
        ? value * 60
        : value;

  return Math.max(0, Math.round(seconds * 1000));
}

export function timeLimitStopReason(durationMs: number): string {
  return `Time limit reached (${(durationMs / 1000).toFixed(1)}s)`;
}
