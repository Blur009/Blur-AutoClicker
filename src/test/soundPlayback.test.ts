import { describe, expect, it } from "vitest";
import { resolvedVolume, soundFileName } from "../soundPlayback";

describe("resolvedVolume", () => {
  it("multiplies master and per-sound volume", () => {
    expect(resolvedVolume(100, 50)).toBeCloseTo(0.5);
    expect(resolvedVolume(50, 50)).toBeCloseTo(0.25);
    expect(resolvedVolume(80, 25)).toBeCloseTo(0.2);
  });

  it("returns 0 when either volume is 0", () => {
    expect(resolvedVolume(0, 100)).toBe(0);
    expect(resolvedVolume(100, 0)).toBe(0);
  });

  it("clamps out-of-range and non-finite input", () => {
    expect(resolvedVolume(500, 500)).toBe(1);
    expect(resolvedVolume(-50, 100)).toBe(0);
    expect(resolvedVolume(Number.NaN, 100)).toBe(0);
  });
});

describe("soundFileName", () => {
  it("falls back to the bundled file name when no path is set", () => {
    expect(soundFileName("", "enable")).toBe("enable.wav");
    expect(soundFileName("   ", "disable")).toBe("disable.wav");
  });

  it("reads the last segment of Windows and POSIX paths", () => {
    expect(soundFileName("C:\\Sounds\\pop.wav", "enable")).toBe("pop.wav");
    expect(soundFileName("/home/user/click.mp3", "disable")).toBe("click.mp3");
  });
});
