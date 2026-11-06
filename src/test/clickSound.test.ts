import { describe, expect, it } from "vitest";
import {
  CLICK_SOUND_FAST_MIN_INTERVAL_MS,
  CLICK_SOUND_MIN_INTERVAL_MS,
  clickSoundIntervalMs,
} from "../clickSound";
import { createDefaultSettings } from "../settingsSchema";

const base = createDefaultSettings("0.0.0");

describe("clickSoundIntervalMs", () => {
  it("follows a slow click rate", () => {
    const settings = {
      ...base,
      rateInputMode: "rate" as const,
      clickSpeed: 10,
      clickInterval: "s" as const,
    };
    expect(clickSoundIntervalMs(settings)).toBe(100);
  });

  it("caps at ten a second unless the user opts in", () => {
    const fast = {
      ...base,
      rateInputMode: "rate" as const,
      clickSpeed: 500,
      clickInterval: "s" as const,
    };
    expect(CLICK_SOUND_MIN_INTERVAL_MS).toBe(100);
    expect(clickSoundIntervalMs(fast)).toBe(CLICK_SOUND_MIN_INTERVAL_MS);
    expect(
      clickSoundIntervalMs({ ...fast, clickSoundAllowFastRate: true }),
    ).toBe(CLICK_SOUND_FAST_MIN_INTERVAL_MS);
  });

  it("still follows the rate between the two caps", () => {
    const settings = {
      ...base,
      rateInputMode: "rate" as const,
      clickSpeed: 15,
      clickInterval: "s" as const,
      clickSoundAllowFastRate: true,
    };
    expect(clickSoundIntervalMs(settings)).toBe(67);
  });

  it("follows a hold likewise when the app is in duration mode", () => {
    const settings = {
      ...base,
      rateInputMode: "duration" as const,
      durationMilliseconds: 250,
    };

    expect(clickSoundIntervalMs(settings)).toBe(250);
  });

  it("floors a hold shorter than the cap", () => {
    const settings = {
      ...base,
      rateInputMode: "duration" as const,
      durationMilliseconds: 5,
    };

    expect(clickSoundIntervalMs(settings)).toBe(CLICK_SOUND_MIN_INTERVAL_MS);
  });
});
