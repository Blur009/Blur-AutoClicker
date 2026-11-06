import { trimBounds } from "./soundTrim";

const durationCache = new Map<string, number>();
const inFlight = new Map<string, Promise<number>>();
const PROBE_TIMEOUT_MS = 3000;

export function formatCompactDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = Math.round(ms / 100) / 10;
  if (seconds < 60) {
    return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
  }
  const whole = Math.round(ms / 1000);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

export function effectivePlayLength(
  trimStart: number,
  trimEnd: number,
  durationMs: number | null,
): number | null {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  const bounds = trimBounds(trimStart, trimEnd, durationMs);
  return bounds.end - bounds.start;
}

export function clearSoundDurationCache(): void {
  durationCache.clear();
}

export function probeSoundDuration(src: string): Promise<number> {
  const cached = durationCache.get(src);
  if (cached !== undefined) return Promise.resolve(cached);
  const running = inFlight.get(src);
  if (running) return running;

  const probe = new Promise<number>((resolve, reject) => {
    const audio = new Audio(src);
    audio.preload = "metadata";
    let timer = 0;
    const done = (value: number | null) => {
      window.clearTimeout(timer);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("error", onError);
      audio.removeAttribute("src");
      audio.load();
      if (value !== null && Number.isFinite(value) && value > 0) {
        durationCache.set(src, value);
        resolve(value);
      } else {
        reject(new Error("duration unavailable"));
      }
    };
    const onLoaded = () =>
      done(audio.duration > 0 ? audio.duration * 1000 : null);
    const onError = () => done(null);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("error", onError);
    timer = window.setTimeout(() => done(null), PROBE_TIMEOUT_MS);
  }).finally(() => inFlight.delete(src));

  inFlight.set(src, probe);
  return probe;
}
