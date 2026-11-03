import { describe, expect, it } from "vitest";
import {
  computePeaks,
  formatSoundTime,
  MIN_TRIM_MS,
  soundTrimFor,
  soundTrimPatch,
  SOUND_TRIM_MAX_MS,
  trimBounds,
} from "../soundTrim";
import { createDefaultSettings } from "../settingsSchema";

const base = createDefaultSettings("0.0.0");

describe("trimBounds", () => {
  it("treats an end of 0 as the whole file", () => {
    expect(trimBounds(0, 0, 1500)).toEqual({ start: 0, end: 1500 });
  });

  it("keeps the region inside the file", () => {
    expect(trimBounds(-50, 5000, 1500)).toEqual({ start: 0, end: 1500 });
  });

  it("keeps a minimum width", () => {
    expect(trimBounds(900, 905, 1500)).toEqual({
      start: 900,
      end: 900 + MIN_TRIM_MS,
    });
  });

  it("pins the start to the last possible position", () => {
    expect(trimBounds(2000, 0, 1500)).toEqual({
      start: 1500 - MIN_TRIM_MS,
      end: 1500,
    });
  });

  it("does nothing without a known duration", () => {
    expect(trimBounds(100, 200, 0)).toEqual({ start: 0, end: 0 });
  });
});

describe("computePeaks", () => {
  it("normalises the loudest bucket to 1", () => {
    expect(computePeaks([0, 0.5, -1, 0.25], 2)).toEqual([0.5, 1]);
  });

  it("scales a quiet file up so it still draws", () => {
    expect(computePeaks([0.1, -0.2], 1)).toEqual([1]);
  });

  it("returns silence for an empty buffer", () => {
    expect(computePeaks([], 3)).toEqual([0, 0, 0]);
  });
});

describe("formatSoundTime", () => {
  it("reads as minutes, seconds, hundredths", () => {
    expect(formatSoundTime(0)).toBe("0:00.00");
    expect(formatSoundTime(1234)).toBe("0:01.23");
    expect(formatSoundTime(65_430)).toBe("1:05.43");
    expect(formatSoundTime(Number.NaN)).toBe("0:00.00");
  });
});

describe("trim settings", () => {
  it("round-trips through the patch", () => {
    const patch = soundTrimPatch("click", { start: 12.4, end: 180.6 });
    const settings = { ...base, ...patch };
    expect(soundTrimFor("click", settings)).toEqual({ start: 12, end: 181 });
  });

  it("keeps each kind on its own trim", () => {
    const settings = {
      ...base,
      ...soundTrimPatch("enable", { start: 10, end: 20 }),
      ...soundTrimPatch("disable", { start: 30, end: 40 }),
      ...soundTrimPatch("click", { start: 50, end: 60 }),
    };

    expect(soundTrimFor("enable", settings)).toEqual({ start: 10, end: 20 });
    expect(soundTrimFor("disable", settings)).toEqual({ start: 30, end: 40 });
    expect(soundTrimFor("click", settings)).toEqual({ start: 50, end: 60 });
  });

  it("never stores a negative trim", () => {
    expect(soundTrimPatch("enable", { start: -20, end: -5 })).toEqual({
      enableSoundTrimStart: 0,
      enableSoundTrimEnd: 0,
    });
  });

  it("exports the same ceiling the settings schema clamps to", () => {
    expect(SOUND_TRIM_MAX_MS).toBe(600_000);
  });
});
