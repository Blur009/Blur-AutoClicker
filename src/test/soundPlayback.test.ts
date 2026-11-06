import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  previewClickerSound,
  playClickerSound,
  stopClickerSounds,
  resolvedVolume,
  soundEnabledFor,
  soundFileName,
  soundPathFor,
  soundSrcFor,
  soundVolumeFor,
} from "../soundPlayback";
import { createDefaultSettings } from "../settingsSchema";
import { FakeAudioElement, installFakeAudio } from "./fakeAudio";
import { tauri } from "./tauriHarness";
import { logDiagnostic } from "../diagnostics";

vi.mock(
  "@tauri-apps/api/core",
  async () => (await import("./tauriHarness")).coreModule,
);

vi.mock("../diagnostics", () => ({
  logDiagnostic: vi.fn(),
  logWarning: vi.fn(),
}));

const base = createDefaultSettings("0.0.0");

let seq = 0;
function uniquePath(): string {
  seq += 1;
  return `C:/sounds/track-${seq}.wav`;
}

async function flushMicrotasks(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

function withPaths(overrides: Record<string, string> = {}): typeof base {
  return {
    ...base,
    enableSoundPath: overrides.enable ?? uniquePath(),
    disableSoundPath: overrides.disable ?? uniquePath(),
    clickSoundPath: overrides.click ?? uniquePath(),
  };
}

beforeEach(() => {
  tauri.reset();
  installFakeAudio();
  vi.mocked(logDiagnostic).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("resolvedVolume", () => {
  it("multiplies master and per-sound volume", () => {
    expect(resolvedVolume(50, 50)).toBe(0.25);
    expect(resolvedVolume(100, 100)).toBe(1);
    expect(resolvedVolume(0, 80)).toBe(0);
  });
});

describe("soundFileName", () => {
  it("falls back to the bundled name for an empty path", () => {
    expect(soundFileName("   ", "disable")).toBe("disable.wav");
  });

  it("uses the enabled sound as the default for every click", () => {
    expect(soundFileName("", "click")).toBe("enable.wav");
    expect(soundFileName("", "enable")).toBe("enable.wav");
    expect(soundFileName("", "disable")).toBe("disable.wav");
  });

  it("reads the last segment of Windows and POSIX paths", () => {
    expect(soundFileName("C:\\Sounds\\pop.wav", "enable")).toBe("pop.wav");
    expect(soundFileName("/home/user/click.mp3", "disable")).toBe("click.mp3");
  });
});

describe("per-kind settings", () => {
  const settings = {
    ...base,
    enableSoundPath: "C:/a/enable.wav",
    disableSoundPath: "C:/a/disable.wav",
    clickSoundPath: "C:/a/click.wav",
    enableSoundVolume: 10,
    disableSoundVolume: 20,
    clickSoundVolume: 30,
    enableSoundEnabled: true,
    disableSoundEnabled: false,
    clickSoundEnabled: false,
  };

  it("reads the path of each kind", () => {
    expect(soundPathFor("enable", settings)).toBe("C:/a/enable.wav");
    expect(soundPathFor("disable", settings)).toBe("C:/a/disable.wav");
    expect(soundPathFor("click", settings)).toBe("C:/a/click.wav");
  });

  it("reads the volume of each kind", () => {
    expect(soundVolumeFor("enable", settings)).toBe(10);
    expect(soundVolumeFor("disable", settings)).toBe(20);
    expect(soundVolumeFor("click", settings)).toBe(30);
  });

  it("reads the toggle of each kind", () => {
    expect(soundEnabledFor("enable", settings)).toBe(true);
    expect(soundEnabledFor("disable", settings)).toBe(false);
    expect(soundEnabledFor("click", settings)).toBe(false);
  });

  it("resolves the playback source, custom or bundled", () => {
    expect(soundSrcFor("click", settings)).toBe(
      "asset://localhost/C:/a/click.wav",
    );
    expect(soundSrcFor("click", { ...settings, clickSoundPath: "" })).toBe(
      "/sounds/enable.wav",
    );
  });
});

describe("previewClickerSound", () => {
  it("plays the bundled default when no file is set", async () => {
    const element = await previewClickerSound("enable", base);

    expect(element).not.toBeNull();
    expect(element?.src).toBe("/sounds/enable.wav");
    expect(FakeAudioElement.instances[0].playCalls).toBe(1);
  });

  it("ignores the sound toggle and the mute switch", async () => {
    const settings = { ...base, soundMuted: true, enableSoundEnabled: false };

    expect(await previewClickerSound("enable", settings)).not.toBeNull();
  });

  it("stays silent at zero volume", async () => {
    const settings = { ...base, soundVolume: 0 };

    expect(await previewClickerSound("enable", settings)).toBeNull();
    expect(FakeAudioElement.instances).toHaveLength(0);
  });

  it("waits for metadata before seeking to the trim start", async () => {
    const settings = {
      ...withPaths(),
      enableSoundTrimStart: 200,
      enableSoundTrimEnd: 600,
    };

    const pending = previewClickerSound("enable", settings);
    await flushMicrotasks();
    expect(FakeAudioElement.instances).toHaveLength(1);
    const element = FakeAudioElement.instances[0];
    expect(element.playCalls).toBe(0);

    element.emitMetadata(1.5);
    const played = await pending;

    expect(played).toBe(element);
    expect(element.currentTime).toBeCloseTo(0.2);
    expect(element.playCalls).toBe(1);
  });

  it("rewinds an element that was left further in", async () => {
    const settings = {
      ...withPaths(),
      enableSoundTrimStart: 200,
      enableSoundTrimEnd: 600,
    };
    const pending = previewClickerSound("enable", settings);
    await flushMicrotasks();
    const element = FakeAudioElement.instances[0];
    element.currentTime = 0.9;
    element.emitMetadata(1.5);
    await pending;

    expect(element.currentTime).toBeCloseTo(0.2);
  });

  it("rewinds an element that finished further in when there is no trim", async () => {
    const settings = withPaths();
    await previewClickerSound("enable", settings);

    const element = FakeAudioElement.instances[0];
    element.currentTime = 0.9;

    await previewClickerSound("enable", settings);

    expect(element.currentTime).toBe(0);
  });

  it("stops at the trim end instead of running to the file end", async () => {
    vi.useFakeTimers();
    const settings = {
      ...withPaths(),
      enableSoundTrimStart: 200,
      enableSoundTrimEnd: 600,
    };
    const pending = previewClickerSound("enable", settings);
    await flushMicrotasks();
    const element = FakeAudioElement.instances[0];
    element.emitMetadata(1.5);
    await pending;

    expect(element.pauseCalls).toBe(0);
    vi.advanceTimersByTime(399);
    expect(element.pauseCalls).toBe(0);
    vi.advanceTimersByTime(1);
    expect(element.pauseCalls).toBe(1);
  });

  it("clears the previous stop timer when the same element plays again", async () => {
    vi.useFakeTimers();
    const settings = {
      ...withPaths(),
      enableSoundTrimStart: 0,
      enableSoundTrimEnd: 400,
    };

    const first = previewClickerSound("enable", settings);
    await flushMicrotasks();
    const element = FakeAudioElement.instances[0];
    element.emitMetadata(0.5);
    await first;

    element.paused = false;
    const second = previewClickerSound("enable", settings);
    await second;

    vi.advanceTimersByTime(400);
    expect(element.paused).toBe(true);
    expect(element.pauseCalls).toBe(1);
  });

  it("does not treat an interrupted play as a broken file", async () => {
    const settings = {
      ...withPaths(),
      enableSoundTrimStart: 100,
      enableSoundTrimEnd: 300,
    };

    const first = previewClickerSound("enable", settings);
    await flushMicrotasks();
    const element = FakeAudioElement.instances[0];
    element.playError = "interrupted by pause";
    element.playErrorName = "AbortError";
    element.emitMetadata(1.5);
    expect(await first).toBeNull();

    element.playError = null;
    expect(await previewClickerSound("enable", settings)).not.toBeNull();
    expect(vi.mocked(logDiagnostic)).not.toHaveBeenCalled();
  });

  it("gives up when the file never reports its length", async () => {
    vi.useFakeTimers();
    const settings = {
      ...withPaths(),
      enableSoundTrimStart: 100,
      enableSoundTrimEnd: 300,
    };

    const first = previewClickerSound("enable", settings);
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(1500);

    await expect(first).resolves.toBeNull();
    expect(vi.mocked(logDiagnostic)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logDiagnostic).mock.calls[0][0]).toBe("Sound.metadata");

    const second = previewClickerSound("enable", settings);
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(1500);
    await expect(second).resolves.toBeNull();
    expect(vi.mocked(logDiagnostic)).toHaveBeenCalledTimes(1);
  });

  it("stays silent when the file is not authorized", async () => {
    tauri.setInvokeHandler("allow_local_media", () => {
      throw new Error("denied");
    });

    expect(await previewClickerSound("enable", withPaths())).toBeNull();
    expect(FakeAudioElement.instances).toHaveLength(0);
    expect(vi.mocked(logDiagnostic).mock.calls[0][0]).toBe("Sound.authorize");
  });

  it("reports a failed play once and stays quiet until the retry window", async () => {
    vi.useFakeTimers();
    const settings = {
      ...withPaths(),
      enableSoundTrimStart: 100,
      enableSoundTrimEnd: 300,
    };
    const element = FakeAudioElement.instances;
    const first = previewClickerSound("enable", settings);
    await flushMicrotasks();
    element[0].emitMetadata(1.5);
    element[0].playError = "broken";
    expect(await first).toBeNull();
    expect(vi.mocked(logDiagnostic)).toHaveBeenCalledTimes(1);

    expect(await previewClickerSound("enable", settings)).toBeNull();
    expect(vi.mocked(logDiagnostic)).toHaveBeenCalledTimes(1);
    expect(FakeAudioElement.instances).toHaveLength(1);

    vi.advanceTimersByTime(10_001);
    FakeAudioElement.instances[0].playError = null;
    const retried = await previewClickerSound("enable", settings);
    expect(retried).not.toBeNull();
    expect(FakeAudioElement.instances[0].loadCalls).toBeGreaterThan(0);
  });
});

describe("playClickerSound", () => {
  it("honours the mute switch and the toggle", async () => {
    expect(
      await playClickerSound("enable", { ...base, soundMuted: true }),
    ).toBeUndefined();
    expect(
      await playClickerSound("enable", { ...base, enableSoundEnabled: false }),
    ).toBeUndefined();
    expect(FakeAudioElement.instances).toHaveLength(0);
  });

  it("reuses one element for a non-click sound", async () => {
    const settings = { ...withPaths(), enableSoundEnabled: true };

    await playClickerSound("enable", settings);
    await playClickerSound("enable", settings);

    expect(FakeAudioElement.instances).toHaveLength(1);
    expect(FakeAudioElement.instances[0].playCalls).toBe(2);
  });

  it("cycles the click pool instead of restarting one element", async () => {
    const settings = { ...withPaths(), clickSoundEnabled: true };

    for (let i = 0; i < 7; i += 1) {
      await playClickerSound("click", settings);
    }

    expect(FakeAudioElement.instances).toHaveLength(6);
    expect(FakeAudioElement.instances.map((entry) => entry.playCalls)).toEqual([
      2, 1, 1, 1, 1, 1,
    ]);
  });

  it("keeps the preview element out of the click pool", async () => {
    const settings = { ...withPaths(), clickSoundEnabled: true };

    await playClickerSound("click", settings);
    await previewClickerSound("click", settings);

    const pooled = FakeAudioElement.instances.filter(
      (entry) => entry.playCalls > 1,
    );
    expect(pooled).toHaveLength(0);
    expect(FakeAudioElement.instances.length).toBeGreaterThan(6);
  });

  it("keeps the audio cache bounded when every element is busy", async () => {
    for (let index = 0; index < 5; index += 1) {
      await previewClickerSound("enable", withPaths());
    }

    expect(FakeAudioElement.instances).toHaveLength(5);
    expect(FakeAudioElement.instances[0].released).toBe(true);
  });

  it("does not start a click that was in flight when playback stopped", async () => {
    const settings = {
      ...withPaths(),
      clickSoundEnabled: true,
      clickSoundTrimStart: 0,
      clickSoundTrimEnd: 400,
    };

    const pending = playClickerSound("click", settings);
    await flushMicrotasks();
    const element = FakeAudioElement.instances[0];

    stopClickerSounds();
    element.emitMetadata(1.5);
    await pending;

    expect(element.playCalls).toBe(0);
    expect(element.paused).toBe(true);
  });

  it("still plays the one-shot chime that was in flight", async () => {
    const settings = {
      ...withPaths(),
      enableSoundEnabled: true,
      enableSoundTrimStart: 0,
      enableSoundTrimEnd: 400,
    };

    const pending = playClickerSound("enable", settings);
    await flushMicrotasks();
    const element = FakeAudioElement.instances[0];

    stopClickerSounds();
    element.emitMetadata(1.5);
    await pending;

    expect(element.playCalls).toBe(1);
  });

  it("silences the click pool on request", async () => {
    const settings = { ...withPaths(), clickSoundEnabled: true };
    for (let index = 0; index < 3; index += 1) {
      await playClickerSound("click", settings);
    }

    const playing = FakeAudioElement.instances.filter((entry) => !entry.paused);
    expect(playing).toHaveLength(3);

    stopClickerSounds();

    expect(playing.every((entry) => entry.paused)).toBe(true);
  });

  it("drops the oldest click pool once the cache is full", async () => {
    vi.resetModules();
    const fresh = await import("../soundPlayback");
    FakeAudioElement.reset();

    for (let index = 0; index < 3; index += 1) {
      await fresh.playClickerSound("click", {
        ...base,
        clickSoundEnabled: true,
        clickSoundPath: `C:/sounds/pool-${index}.wav`,
      });
    }

    expect(FakeAudioElement.instances).toHaveLength(18);
    const released = FakeAudioElement.instances.filter(
      (entry) => entry.released,
    );
    expect(released).toHaveLength(6);
    expect(released.every((entry) => entry.src === "")).toBe(true);
  });
});
