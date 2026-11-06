import { getEffectiveIntervalMs } from "./cadence";
import type { Settings } from "./store";

export const CLICK_SOUND_MAX_RATE_HZ = 10;

export const CLICK_SOUND_MIN_INTERVAL_MS = 1000 / CLICK_SOUND_MAX_RATE_HZ;

export const CLICK_SOUND_FAST_RATE_HZ = 25;

export const CLICK_SOUND_FAST_MIN_INTERVAL_MS = 1000 / CLICK_SOUND_FAST_RATE_HZ;

export function clickSoundIntervalMs(settings: Settings): number {
  const floor = settings.clickSoundAllowFastRate
    ? CLICK_SOUND_FAST_MIN_INTERVAL_MS
    : CLICK_SOUND_MIN_INTERVAL_MS;
  return Math.max(floor, Math.round(getEffectiveIntervalMs(settings)));
}
