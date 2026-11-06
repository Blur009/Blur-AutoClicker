import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  effectivePlayLength,
  formatCompactDuration,
  probeSoundDuration,
} from "../soundDuration";
import { trimBounds } from "../soundTrim";
import { FakeAudioElement, installFakeAudio } from "./fakeAudio";

beforeEach(() => {
  installFakeAudio();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formatCompactDuration", () => {
  it("uses milliseconds under a second", () => {
    expect(formatCompactDuration(0)).toBe("0ms");
    expect(formatCompactDuration(12)).toBe("12ms");
    expect(formatCompactDuration(999)).toBe("999ms");
  });

  it("uses seconds up to a minute", () => {
    expect(formatCompactDuration(1000)).toBe("1s");
    expect(formatCompactDuration(1250)).toBe("1.3s");
    expect(formatCompactDuration(59_900)).toBe("59.9s");
  });

  it("never prints a minute with sixty seconds", () => {
    expect(formatCompactDuration(59_960)).toBe("1m");
    expect(formatCompactDuration(119_700)).toBe("2m");
    expect(formatCompactDuration(119_400)).toBe("1m 59s");
  });

  it("uses minutes past a minute", () => {
    expect(formatCompactDuration(60_000)).toBe("1m");
    expect(formatCompactDuration(62_000)).toBe("1m 2s");
    expect(formatCompactDuration(125_000)).toBe("2m 5s");
  });

  it("renders nothing for an unknown length", () => {
    expect(formatCompactDuration(null)).toBe("");
    expect(formatCompactDuration(Number.NaN)).toBe("");
    expect(formatCompactDuration(-1)).toBe("");
  });
});

describe("effectivePlayLength", () => {
  it("uses the trimmed range when there is one", () => {
    expect(effectivePlayLength(120, 380, 500)).toBe(260);
  });

  it("falls back to the file length for an open end", () => {
    expect(effectivePlayLength(120, 0, 500)).toBe(380);
    expect(effectivePlayLength(0, 0, 500)).toBe(500);
  });

  it("is unknown until the file length is", () => {
    expect(effectivePlayLength(0, 0, null)).toBeNull();
    expect(effectivePlayLength(120, 0, null)).toBeNull();
    expect(effectivePlayLength(0, 0, 0)).toBeNull();
  });

  it("matches the bounds the player and the waveform use", () => {
    const cases = [
      [1490, 0, 1500],
      [900, 905, 1500],
      [-50, 5000, 1500],
      [2000, 0, 1500],
    ] as const;

    for (const [start, end, duration] of cases) {
      const bounds = trimBounds(start, end, duration);
      expect(effectivePlayLength(start, end, duration)).toBe(
        bounds.end - bounds.start,
      );
    }
  });
});

describe("probeSoundDuration", () => {
  it("reports the file length in milliseconds", async () => {
    const pending = probeSoundDuration("/sounds/probe-a.wav");
    FakeAudioElement.instances[0].emitMetadata(2.25);

    await expect(pending).resolves.toBe(2250);
  });

  it("reuses one probe per source", async () => {
    const first = probeSoundDuration("/sounds/probe-b.wav");
    const second = probeSoundDuration("/sounds/probe-b.wav");
    expect(first).toBe(second);

    FakeAudioElement.instances[0].emitMetadata(1);

    await expect(first).resolves.toBe(1000);
    expect(FakeAudioElement.instances).toHaveLength(1);
  });

  it("answers from the cache without touching the file again", async () => {
    const first = probeSoundDuration("/sounds/probe-c.wav");
    FakeAudioElement.instances[0].emitMetadata(0.5);
    await first;

    await expect(probeSoundDuration("/sounds/probe-c.wav")).resolves.toBe(500);
    expect(FakeAudioElement.instances).toHaveLength(1);
  });

  it("rejects as soon as the file errors", async () => {
    vi.useFakeTimers();
    const pending = probeSoundDuration("/sounds/probe-missing.wav");
    const element = FakeAudioElement.instances[0];
    element.dispatchEvent(new Event("error"));

    await expect(pending).rejects.toThrow("duration unavailable");
    expect(element.released).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects when the length is not a positive number", async () => {
    const pending = probeSoundDuration("/sounds/probe-empty.wav");
    FakeAudioElement.instances[0].emitMetadata(0);

    await expect(pending).rejects.toThrow("duration unavailable");
  });

  it("gives up on a load that never settles", async () => {
    vi.useFakeTimers();
    const pending = probeSoundDuration("/sounds/probe-stalled.wav");
    const assertion = expect(pending).rejects.toThrow("duration unavailable");

    await vi.advanceTimersByTimeAsync(3000);

    await assertion;
  });
});
