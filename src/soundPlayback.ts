import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { logDiagnostic } from "./diagnostics";
import type { Settings } from "./store";
import { soundTrimFor, trimBounds } from "./soundTrim";

export type ClickerSoundKind = "enable" | "disable" | "click";

export const SOUND_FILE_EXTENSIONS = [
  "wav",
  "mp3",
  "ogg",
  "oga",
  "m4a",
  "aac",
  "flac",
  "opus",
  "weba",
];

export const DEFAULT_SOUND_SOURCES: Record<ClickerSoundKind, string> = {
  enable: "/sounds/enable.wav",
  disable: "/sounds/disable.wav",
  click: "/sounds/enable.wav",
};

const DEFAULT_SOUND_NAMES: Record<ClickerSoundKind, string> = {
  enable: "enable.wav",
  disable: "disable.wav",
  click: "enable.wav",
};

const METADATA_TIMEOUT_MS = 1500;
const FAILURE_RETRY_MS = 10_000;
const MAX_CACHED_AUDIO = 4;
const CLICK_POOL_SIZE = 6;
const MAX_CLICK_POOLS = 2;

const authorizedPaths = new Set<string>();
const audioElements = new Map<string, HTMLAudioElement>();
const clickPools = new Map<
  string,
  { elements: HTMLAudioElement[]; next: number }
>();
const failedSources = new Map<string, number>();
const reportedFailures = new Set<string>();
const stopTimers = new Map<HTMLAudioElement, number>();
let clickEpoch = 0;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function resolvedVolume(
  masterVolume: number,
  soundVolume: number,
): number {
  return (clampPercent(masterVolume) / 100) * (clampPercent(soundVolume) / 100);
}

export function soundFileName(path: string, kind: ClickerSoundKind): string {
  const trimmed = path.trim();
  if (!trimmed) return DEFAULT_SOUND_NAMES[kind];
  const segments = trimmed.split(/[/\\]/);
  const last = segments[segments.length - 1];
  return last || DEFAULT_SOUND_NAMES[kind];
}

export function soundPathFor(
  kind: ClickerSoundKind,
  settings: Settings,
): string {
  switch (kind) {
    case "enable":
      return settings.enableSoundPath;
    case "disable":
      return settings.disableSoundPath;
    case "click":
      return settings.clickSoundPath;
  }
}

export function soundVolumeFor(
  kind: ClickerSoundKind,
  settings: Settings,
): number {
  switch (kind) {
    case "enable":
      return settings.enableSoundVolume;
    case "disable":
      return settings.disableSoundVolume;
    case "click":
      return settings.clickSoundVolume;
  }
}

export function soundEnabledFor(
  kind: ClickerSoundKind,
  settings: Settings,
): boolean {
  switch (kind) {
    case "enable":
      return settings.enableSoundEnabled;
    case "disable":
      return settings.disableSoundEnabled;
    case "click":
      return settings.clickSoundEnabled;
  }
}

export async function authorizeSoundPath(path: string): Promise<boolean> {
  return authorizePath(path);
}

export function soundSrcFor(
  kind: ClickerSoundKind,
  settings: Settings,
): string {
  const path = soundPathFor(kind, settings).trim();
  return path ? convertFileSrc(path) : DEFAULT_SOUND_SOURCES[kind];
}

async function authorizePath(path: string): Promise<boolean> {
  if (authorizedPaths.has(path)) return true;
  try {
    await invoke("allow_local_media", { path });
    authorizedPaths.add(path);
    return true;
  } catch (err) {
    logDiagnostic("Sound.authorize", { error: String(err), path });
    return false;
  }
}

function releaseElement(element: HTMLAudioElement): void {
  element.pause();
  element.removeAttribute("src");
  element.load();
}

function getAudioElement(src: string): HTMLAudioElement {
  const cached = audioElements.get(src);
  if (cached) return cached;

  if (audioElements.size >= MAX_CACHED_AUDIO) {
    let evicted = false;
    for (const [key, element] of audioElements) {
      if (!element.paused) continue;
      releaseElement(element);
      audioElements.delete(key);
      evicted = true;
      break;
    }
    if (!evicted) {
      const oldest = audioElements.keys().next();
      if (!oldest.done) {
        const element = audioElements.get(oldest.value);
        if (element) releaseElement(element);
        audioElements.delete(oldest.value);
      }
    }
  }

  const element = new Audio(src);
  element.preload = "auto";
  audioElements.set(src, element);
  return element;
}

function nextClickElement(src: string): HTMLAudioElement {
  const pool = clickPools.get(src);
  if (pool) {
    const element = pool.elements[pool.next % pool.elements.length];
    pool.next += 1;
    return element;
  }

  if (clickPools.size >= MAX_CLICK_POOLS) {
    for (const [key, stale] of clickPools) {
      stale.elements.forEach(releaseElement);
      clickPools.delete(key);
      break;
    }
  }

  const elements = Array.from({ length: CLICK_POOL_SIZE }, () => {
    const element = new Audio(src);
    element.preload = "auto";
    return element;
  });
  clickPools.set(src, { elements, next: 1 });
  return elements[0];
}

function isAbortError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  return (err as { name?: unknown }).name === "AbortError";
}

function durationMsOf(audio: HTMLAudioElement): number {
  return Number.isFinite(audio.duration) ? audio.duration * 1000 : 0;
}

function waitForMetadata(audio: HTMLAudioElement): Promise<void> {
  if (Number.isFinite(audio.duration)) return Promise.resolve();
  return new Promise((resolve) => {
    let timer = 0;
    const finish = () => {
      window.clearTimeout(timer);
      audio.removeEventListener("loadedmetadata", finish);
      audio.removeEventListener("error", finish);
      resolve();
    };
    audio.addEventListener("loadedmetadata", finish);
    audio.addEventListener("error", finish);
    timer = window.setTimeout(finish, METADATA_TIMEOUT_MS);
  });
}

async function startPlayback(
  kind: ClickerSoundKind,
  settings: Settings,
  pooled: boolean,
): Promise<HTMLAudioElement | null> {
  const volume = resolvedVolume(
    settings.soundVolume,
    soundVolumeFor(kind, settings),
  );
  if (volume <= 0) return null;

  const epoch = clickEpoch;
  const cancellable = pooled && kind === "click";
  const path = soundPathFor(kind, settings).trim();
  if (path && !(await authorizePath(path))) return null;
  if (cancellable && epoch !== clickEpoch) return null;

  const src = path ? convertFileSrc(path) : DEFAULT_SOUND_SOURCES[kind];
  const lastFailure = failedSources.get(src);
  if (
    lastFailure !== undefined &&
    Date.now() - lastFailure < FAILURE_RETRY_MS
  ) {
    return null;
  }

  const audio =
    pooled && kind === "click" ? nextClickElement(src) : getAudioElement(src);
  if (lastFailure !== undefined) audio.load();
  audio.volume = volume;

  const trim = soundTrimFor(kind, settings);
  const wantsTrim = trim.start > 0 || trim.end > 0;
  if (wantsTrim && durationMsOf(audio) === 0) {
    await waitForMetadata(audio);
    if (cancellable && epoch !== clickEpoch) return null;
  }
  const durationMs = durationMsOf(audio);
  if (wantsTrim && durationMs === 0) {
    if (!reportedFailures.has(src)) {
      reportedFailures.add(src);
      logDiagnostic("Sound.metadata", { kind, src });
    }
    return null;
  }
  const bounds = trimBounds(trim.start, trim.end, durationMs);
  if (bounds.start > 0) {
    audio.currentTime = bounds.start / 1000;
  } else if (audio.currentTime > 0) {
    audio.currentTime = 0;
  }

  if (cancellable && epoch !== clickEpoch) return null;

  const previous = stopTimers.get(audio);
  if (previous !== undefined) window.clearTimeout(previous);
  stopTimers.delete(audio);

  try {
    await audio.play();
  } catch (err) {
    if (!audio.src || isAbortError(err)) return null;
    failedSources.set(src, Date.now());
    if (!reportedFailures.has(src)) {
      reportedFailures.add(src);
      logDiagnostic("Sound.play", { error: String(err), kind, src });
    }
    return null;
  }
  failedSources.delete(src);
  reportedFailures.delete(src);

  if (durationMs > 0 && bounds.end > bounds.start) {
    stopTimers.set(
      audio,
      window.setTimeout(() => {
        audio.pause();
        stopTimers.delete(audio);
      }, bounds.end - bounds.start),
    );
  }
  return audio;
}

export function stopClickerSounds(): void {
  clickEpoch += 1;
  for (const pool of clickPools.values()) {
    for (const element of pool.elements) {
      const timer = stopTimers.get(element);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        stopTimers.delete(element);
      }
      if (!element.paused) element.pause();
    }
  }
}

export async function playClickerSound(
  kind: ClickerSoundKind,
  settings: Settings,
): Promise<void> {
  if (settings.soundMuted) return;
  if (!soundEnabledFor(kind, settings)) return;
  await startPlayback(kind, settings, true);
}

export async function previewClickerSound(
  kind: ClickerSoundKind,
  settings: Settings,
): Promise<HTMLAudioElement | null> {
  return startPlayback(kind, settings, false);
}
