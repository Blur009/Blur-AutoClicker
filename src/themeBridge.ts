import { emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ThemeBase, ThemeMode, ThemeProfile } from "./themeModel";

export const MAIN_WINDOW_LABEL = "main";
export const THEME_WINDOW_LABEL = "theme";
export const THEME_APPLY_EVENT = "theme-apply";
export const THEME_STATE_EVENT = "theme-state";

export interface ThemeUpsertMessage {
  kind: "upsert";
  sessionId: string;
  seq: number;
  profile: ThemeProfile;
  activateCustom: boolean;
}

export interface ThemeDeleteMessage {
  kind: "delete";
  sessionId: string;
  seq: number;
  profileId: string;
}

export type ThemeApplyMessage = ThemeUpsertMessage | ThemeDeleteMessage;

export interface ThemeProfileSummary {
  id: string;
  name: string;
  base: ThemeBase;
  updatedAt: number;
}

export interface ThemeStateMessage {
  sessionId: string;
  ackSeq: number;
  theme: ThemeMode;
  activeProfileId: string;
  profiles: ThemeProfileSummary[];
  activeProfile: ThemeProfile | null;
}

export function newThemeSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function emitThemeApply(message: ThemeApplyMessage): Promise<void> {
  return emitTo(MAIN_WINDOW_LABEL, THEME_APPLY_EVENT, message);
}

export function onThemeApply(
  handler: (message: ThemeApplyMessage) => void,
): Promise<UnlistenFn> {
  return listen<ThemeApplyMessage>(THEME_APPLY_EVENT, (event) =>
    handler(event.payload),
  );
}

export function emitThemeState(message: ThemeStateMessage): Promise<void> {
  return emitTo(THEME_WINDOW_LABEL, THEME_STATE_EVENT, message);
}

export function onThemeState(
  handler: (message: ThemeStateMessage) => void,
): Promise<UnlistenFn> {
  return listen<ThemeStateMessage>(THEME_STATE_EVENT, (event) =>
    handler(event.payload),
  );
}

export function summarizeProfiles(
  profiles: readonly ThemeProfile[],
): ThemeProfileSummary[] {
  return profiles.map(({ id, name, base, updatedAt }) => ({
    id,
    name,
    base,
    updatedAt,
  }));
}
