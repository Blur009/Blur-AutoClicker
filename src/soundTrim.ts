import type { ClickerSoundKind } from "./soundPlayback";
import type { Settings } from "./store";

export const MIN_TRIM_MS = 20;
export const SOUND_TRIM_MAX_MS = 600_000;

export type SoundTrim = { start: number; end: number };

export function trimBounds(
  startMs: number,
  endMs: number,
  durationMs: number,
): SoundTrim {
  const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  if (duration <= 0) {
    return { start: 0, end: 0 };
  }
  const start = Math.min(
    Math.max(0, Number.isFinite(startMs) ? startMs : 0),
    Math.max(0, duration - MIN_TRIM_MS),
  );
  const requestedEnd = !Number.isFinite(endMs) || endMs <= 0 ? duration : endMs;
  const end = Math.min(duration, Math.max(start + MIN_TRIM_MS, requestedEnd));
  return { start, end };
}

export function soundTrimFor(
  kind: ClickerSoundKind,
  settings: Settings,
): SoundTrim {
  switch (kind) {
    case "enable":
      return {
        start: settings.enableSoundTrimStart,
        end: settings.enableSoundTrimEnd,
      };
    case "disable":
      return {
        start: settings.disableSoundTrimStart,
        end: settings.disableSoundTrimEnd,
      };
    case "click":
      return {
        start: settings.clickSoundTrimStart,
        end: settings.clickSoundTrimEnd,
      };
  }
}

export function soundTrimPatch(
  kind: ClickerSoundKind,
  trim: SoundTrim,
): Partial<Settings> {
  const start = Math.min(
    SOUND_TRIM_MAX_MS,
    Math.max(0, Math.round(trim.start)),
  );
  const end = Math.min(SOUND_TRIM_MAX_MS, Math.max(0, Math.round(trim.end)));
  switch (kind) {
    case "enable":
      return { enableSoundTrimStart: start, enableSoundTrimEnd: end };
    case "disable":
      return { disableSoundTrimStart: start, disableSoundTrimEnd: end };
    case "click":
      return { clickSoundTrimStart: start, clickSoundTrimEnd: end };
  }
}

export function computePeaks(
  samples: Float32Array | number[],
  buckets: number,
): number[] {
  const count = Math.max(1, Math.floor(buckets));
  const total = samples.length;
  if (total === 0) return new Array(count).fill(0);

  const peaks: number[] = [];
  let loudest = 0;
  for (let bucket = 0; bucket < count; bucket += 1) {
    const from = Math.floor((bucket * total) / count);
    const to = Math.max(from + 1, Math.floor(((bucket + 1) * total) / count));
    let peak = 0;
    for (let i = from; i < to && i < total; i += 1) {
      const value = Math.abs(samples[i]);
      if (value > peak) peak = value;
    }
    peaks.push(peak);
    if (peak > loudest) loudest = peak;
  }

  return loudest > 0 ? peaks.map((peak) => peak / loudest) : peaks;
}

export function formatSoundTime(ms: number): string {
  const safe = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const hundredths = Math.floor((safe % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}
