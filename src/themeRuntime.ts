import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { applyAccentTheme } from "./accentTheme";
import { logDiagnostic, logWarning } from "./diagnostics";
import { sanitizeSettings, type Settings } from "./settingsSchema";
import {
  applyThemeTokens,
  clearThemeTokens,
  resolveThemeTokens,
  sanitizeThemeProfile,
  sanitizeThemeProfiles,
  themeBaseOf,
  type ThemeProfile,
} from "./themeModel";
import { emitThemeState, onThemeApply, summarizeProfiles } from "./themeBridge";
import { APP_VERSION } from "./store";

interface ThemeRuntimeOptions {
  settings: Settings;
  settingsLoaded: boolean;
  windowOpacity: number;
  panelOpacity: number;
  panelBlur: number;
  backgroundBlur: number;
  readCommittedSettings: () => Settings;
  commitSettings: (settings: Settings) => void;
  openCustomizer: () => void;
}

function findThemeProfile(settings: Settings): ThemeProfile | null {
  if (!settings.activeThemeProfileId) return null;
  return (
    settings.themeProfiles.find(
      (profile) => profile.id === settings.activeThemeProfileId,
    ) ?? null
  );
}

function themeStateKey(settings: Settings): string {
  return JSON.stringify({
    theme: settings.theme,
    activeProfileId: settings.activeThemeProfileId,
    accentColor: settings.accentColor,
    profiles: summarizeProfiles(settings.themeProfiles),
  });
}

export function useThemeRuntime({
  settings,
  settingsLoaded,
  windowOpacity,
  panelOpacity,
  panelBlur,
  backgroundBlur,
  readCommittedSettings,
  commitSettings,
  openCustomizer,
}: ThemeRuntimeOptions): void {
  const themeSessionRef = useRef("");
  const themeSeenSeqRef = useRef<Set<number>>(new Set());
  const themeAckSeqRef = useRef(0);
  const themeStateSeenRef = useRef("");
  const themeAppliedTokensRef = useRef<{ root: string[]; doc: string[] }>({
    root: [],
    doc: [],
  });

  const publishThemeState = useCallback((next: Settings, ackSeq: number) => {
    emitThemeState({
      sessionId: themeSessionRef.current,
      ackSeq,
      theme: next.theme,
      activeProfileId: next.activeThemeProfileId,
      profiles: summarizeProfiles(next.themeProfiles),
      activeProfile: findThemeProfile(next),
    }).catch((err) => {
      logDiagnostic("App.emitThemeState", {
        error: String(err),
      });
    });
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    onThemeApply((message) => {
      if (themeSessionRef.current !== message.sessionId) {
        themeSessionRef.current = message.sessionId;
        themeSeenSeqRef.current = new Set();
        themeAckSeqRef.current = 0;
      }
      if (themeSeenSeqRef.current.has(message.seq)) return;
      themeSeenSeqRef.current.add(message.seq);

      const current = readCommittedSettings();
      const incoming =
        message.kind === "upsert"
          ? sanitizeThemeProfile(message.profile)
          : null;
      const merged =
        message.kind === "delete"
          ? current.themeProfiles.filter(
              (profile) => profile.id !== message.profileId,
            )
          : incoming
            ? current.themeProfiles.some(
                (profile) => profile.id === incoming.id,
              )
              ? current.themeProfiles.map((profile) =>
                  profile.id === incoming.id ? incoming : profile,
                )
              : [...current.themeProfiles, incoming]
            : current.themeProfiles;
      const themeProfiles = sanitizeThemeProfiles(merged);

      let theme = current.theme;
      let activeThemeProfileId = current.activeThemeProfileId;

      if (message.kind === "delete") {
        if (activeThemeProfileId === message.profileId) {
          activeThemeProfileId = "";
        }
      } else if (incoming && message.activateCustom) {
        theme = "custom";
        activeThemeProfileId = incoming.id;
      }

      if (
        !themeProfiles.some((profile) => profile.id === activeThemeProfileId)
      ) {
        activeThemeProfileId = "";
      }
      if (theme === "custom" && !activeThemeProfileId) {
        theme = "dark";
      }

      const nextCommittedSettings = sanitizeSettings(
        { ...current, theme, themeProfiles, activeThemeProfileId },
        APP_VERSION,
      );
      commitSettings(nextCommittedSettings);
      themeAckSeqRef.current = message.seq;
      themeStateSeenRef.current = themeStateKey(nextCommittedSettings);
      publishThemeState(nextCommittedSettings, message.seq);
    })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch((err) => {
        logDiagnostic("App.themeApplyListener", {
          error: String(err),
        });
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [
    commitSettings,
    publishThemeState,
    readCommittedSettings,
    settingsLoaded,
  ]);

  useEffect(() => {
    if (!settingsLoaded) return;
    const key = themeStateKey(settings);
    if (key === themeStateSeenRef.current) return;
    themeStateSeenRef.current = key;
    publishThemeState(settings, themeAckSeqRef.current);
  }, [publishThemeState, settings, settingsLoaded]);

  const activeThemeProfile = findThemeProfile(settings);
  const accentHex =
    settings.theme === "custom" && activeThemeProfile
      ? activeThemeProfile.tokens.accent.hex
      : settings.accentColor;
  const themeBase = themeBaseOf(settings.theme, activeThemeProfile);

  useEffect(() => {
    if (!settingsLoaded) return;
    if (settings.theme !== "custom") {
      applyAccentTheme(accentHex, themeBase);
    }

    invoke("set_accent_color", {
      color: accentHex,
      theme: themeBase,
      iconEnabled: settings.taskbarIconEnabled,
      iconTheme: settings.taskbarIconTheme,
      iconColor: settings.taskbarIconColor,
    }).catch((err) =>
      logWarning("App.applyAccentTheme", {
        error: String(err),
      }),
    );
  }, [
    accentHex,
    themeBase,
    settings.theme,
    settings.taskbarIconEnabled,
    settings.taskbarIconTheme,
    settings.taskbarIconColor,
    settingsLoaded,
  ]);

  useLayoutEffect(() => {
    const root = document.querySelector(".app-root") as HTMLElement | null;
    if (!root) return;

    const profile = findThemeProfile(settings);
    const base = themeBaseOf(settings.theme, profile);
    const tokens = resolveThemeTokens(
      settings.theme,
      profile,
      settings.accentColor,
    );
    const applied = themeAppliedTokensRef.current;
    const opacities = {
      window: windowOpacity,
      panel: panelOpacity,
    };

    document.documentElement.dataset.theme = base;

    if (settings.theme === "custom") {
      applied.doc = applyThemeTokens(
        tokens,
        base,
        opacities,
        document.documentElement,
      );
    } else {
      applied.root = applyThemeTokens(tokens, base, opacities, root);
    }

    root.style.setProperty(
      "--panel-blur-filter",
      panelBlur > 0 ? `blur(${panelBlur}px)` : "none",
    );
    root.style.setProperty("--bg-image-blur", `${backgroundBlur}px`);

    return () => {
      clearThemeTokens(root, applied.root);
      clearThemeTokens(document.documentElement, applied.doc);
      applied.root = [];
      applied.doc = [];
      root.style.removeProperty("--panel-blur-filter");
      root.style.removeProperty("--bg-image-blur");
    };
  }, [backgroundBlur, panelBlur, panelOpacity, settings, windowOpacity]);

  useEffect(() => {
    const handleThemeShortcut = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.altKey || event.code !== "KeyT") return;
      if (event.repeat) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }
      event.preventDefault();
      openCustomizer();
    };

    window.addEventListener("keydown", handleThemeShortcut);
    return () => window.removeEventListener("keydown", handleThemeShortcut);
  }, [openCustomizer]);
}
