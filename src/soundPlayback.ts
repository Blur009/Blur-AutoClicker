import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { logDiagnostic } from "./diagnostics";
import type { Settings } from "./store";

export type ClickerSoundKind = "enable" | "disable";

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

const DEFAULT_SOUND_SOURCES: Record<ClickerSoundKind, string> = {
  enable: "/sounds/enable.wav",
  disable: "/sounds/disable.wav",
};

const DEFAULT_SOUND_NAMES: Record<ClickerSoundKind, string> = {
  enable: "enable.wav",
  disable: "disable.wav",
};

const authorizedPaths = new Set<string>();
const audioElements = new Map<string, HTMLAudioElement>();
const MAX_CACHED_AUDIO = 4;

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
  return kind === "enable"
    ? settings.enableSoundPath
    : settings.disableSoundPath;
}

export function soundVolumeFor(
  kind: ClickerSoundKind,
  settings: Settings,
): number {
  return kind === "enable"
    ? settings.enableSoundVolume
    : settings.disableSoundVolume;
}

export function soundEnabledFor(
  kind: ClickerSoundKind,
  settings: Settings,
): boolean {
  return kind === "enable"
    ? settings.enableSoundEnabled
    : settings.disableSoundEnabled;
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

function getAudioElement(src: string): HTMLAudioElement {
  const cached = audioElements.get(src);
  if (cached) return cached;

  if (audioElements.size >= MAX_CACHED_AUDIO) {
    for (const [src, element] of audioElements) {
      if (element.paused) audioElements.delete(src);
    }
  }

  const element = new Audio(src);
  element.preload = "auto";
  audioElements.set(src, element);
  return element;
}

async function startPlayback(
  kind: ClickerSoundKind,
  settings: Settings,
): Promise<void> {
  const volume = resolvedVolume(
    settings.soundVolume,
    soundVolumeFor(kind, settings),
  );
  if (volume <= 0) return;

  const path = soundPathFor(kind, settings).trim();
  if (path && !(await authorizePath(path))) return;

  const src = path ? convertFileSrc(path) : DEFAULT_SOUND_SOURCES[kind];
  try {
    const audio = getAudioElement(src);
    audio.volume = volume;
    audio.currentTime = 0;
    await audio.play();
  } catch (err) {
    logDiagnostic("Sound.play", { error: String(err), kind, src });
  }
}

export async function playClickerSound(
  kind: ClickerSoundKind,
  settings: Settings,
): Promise<void> {
  if (settings.soundMuted) return;
  if (!soundEnabledFor(kind, settings)) return;
  await startPlayback(kind, settings);
}
