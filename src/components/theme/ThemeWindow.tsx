import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { logDiagnostic } from "../../diagnostics";
import { loadSettings } from "../../store";
import {
  emitThemeApply,
  newThemeSessionId,
  onThemeState,
  type ThemeApplyMessage,
  type ThemeStateMessage,
} from "../../themeBridge";
import {
  DEFAULT_ACCENT_HEX,
  MAX_THEME_PROFILES,
  THEME_PALETTES,
  applyThemeTokens,
  clearThemeTokens,
  cloneThemeTokens,
  createThemeProfile,
  createThemeProfileFromPreset,
  nextThemeProfileName,
  normalizeHex,
  sanitizeThemeProfiles,
  type ThemeColor,
  type ThemeColorKey,
  type ThemeProfile,
  type ThemeShadow,
} from "../../themeModel";
import DesignPage from "./DesignPage";
import ProfileRail from "./ProfileRail";
import TemplateChooser, { type TemplateChoice } from "./TemplateChooser";
import ThemeTitleBar from "./ThemeTitleBar";
import {
  PROFILE_NAME_MAX_LENGTH,
  newThemeProfileId,
  type ThemeRadiusKey,
  type ThemeShadowKey,
} from "./themeEditorShared";

interface ProfileNameFieldProps {
  value: string;
  onChange: (name: string) => void;
}

const ACK_TIMEOUT_MS = 2000;
const CLOSE_TIMEOUT_MS = 2000;
const UNSAVED_ERROR = "Main window is closed. Changes are not saved.";
const ACK_TIMEOUT_ERROR = "Changes are not confirmed yet.";

function PenIcon() {
  return (
    <svg
      className="theme-name-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function ProfileNameField({ value, onChange }: ProfileNameFieldProps) {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  const [focused, setFocused] = useState(false);

  if (value !== lastValue) {
    setLastValue(value);
    if (!focused) setDraft(value);
  }

  return (
    <div className="theme-name-field">
      <input
        className="theme-input theme-name-input"
        value={draft}
        maxLength={PROFILE_NAME_MAX_LENGTH}
        spellCheck={false}
        aria-label="Profile name"
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (next.trim()) onChange(next);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setDraft(value);
        }}
      />
      <PenIcon />
    </div>
  );
}

function uniqueThemeProfileName(
  desired: string,
  profiles: readonly ThemeProfile[],
): string {
  const used = new Set(profiles.map((profile) => profile.name.trim()));
  const base = desired.trim().slice(0, PROFILE_NAME_MAX_LENGTH);
  if (!used.has(base)) return base;
  for (let index = 2; ; index += 1) {
    const suffix = ` ${index}`;
    const candidate = `${base.slice(0, PROFILE_NAME_MAX_LENGTH - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

export default function ThemeWindow() {
  const [sessionId] = useState(newThemeSessionId);
  const [profiles, setProfiles] = useState<ThemeProfile[]>([]);
  const [activeId, setActiveId] = useState("");
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT_HEX);
  const [ready, setReady] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profilesRef = useRef<ThemeProfile[]>([]);
  const activeIdRef = useRef("");
  const deletedRef = useRef(new Set<string>());
  const desiredActiveRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const pendingRef = useRef<ThemeProfile | null>(null);
  const timerRef = useRef<number | null>(null);
  const ackTimerRef = useRef<number | null>(null);
  const awaitingAckSeqRef = useRef(0);
  const lastAckedSeqRef = useRef(0);
  const closeGuardRef = useRef(false);
  const emptyCreateRef = useRef<HTMLButtonElement | null>(null);
  const focusEmptyRef = useRef(false);
  const focusNameRef = useRef(false);

  const selectLocalActive = useCallback((id: string) => {
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

  const reportEmitError = useCallback(() => {
    setError(UNSAVED_ERROR);
  }, []);

  const sendMessage = useCallback(
    (build: (seq: number) => ThemeApplyMessage) => {
      seqRef.current += 1;
      const seq = seqRef.current;
      return emitThemeApply(build(seq))
        .catch(reportEmitError)
        .then(() => {
          if (seq <= lastAckedSeqRef.current) return;
          awaitingAckSeqRef.current = Math.max(awaitingAckSeqRef.current, seq);
          if (ackTimerRef.current !== null)
            window.clearTimeout(ackTimerRef.current);
          ackTimerRef.current = window.setTimeout(() => {
            ackTimerRef.current = null;
            if (awaitingAckSeqRef.current >= seq) setError(ACK_TIMEOUT_ERROR);
          }, ACK_TIMEOUT_MS);
        });
    },
    [reportEmitError],
  );

  const sendUpsert = useCallback(
    (profile: ThemeProfile, activateCustom = true) =>
      sendMessage((seq) => ({
        kind: "upsert",
        sessionId,
        seq,
        profile,
        activateCustom,
      })),
    [sendMessage, sessionId],
  );

  const scheduleUpsert = useCallback(
    (profile: ThemeProfile, delay = 100) => {
      pendingRef.current = profile;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) sendUpsert(pending);
      }, delay);
    },
    [sendUpsert],
  );

  const flushPending = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return Promise.resolve();
    return sendUpsert(pending);
  }, [sendUpsert]);

  const editActive = useCallback(
    (updater: (profile: ThemeProfile) => ThemeProfile, delay = 100) => {
      const id = activeIdRef.current;
      const current = profilesRef.current.find((profile) => profile.id === id);
      if (!current) return;
      const next = { ...updater(current), updatedAt: Date.now() };
      const list = profilesRef.current.map((profile) =>
        profile.id === id ? next : profile,
      );
      profilesRef.current = list;
      setProfiles(list);
      scheduleUpsert(next, delay);
    },
    [scheduleUpsert],
  );

  const handleAck = useCallback(
    (message: ThemeStateMessage) => {
      if (message.sessionId !== sessionId) return;
      if (
        !Number.isFinite(message.ackSeq) ||
        message.ackSeq <= lastAckedSeqRef.current
      ) {
        return;
      }
      lastAckedSeqRef.current = message.ackSeq;
      if (message.ackSeq < awaitingAckSeqRef.current) return;
      awaitingAckSeqRef.current = 0;
      if (ackTimerRef.current !== null) {
        window.clearTimeout(ackTimerRef.current);
        ackTimerRef.current = null;
      }
      setError((current) =>
        current === UNSAVED_ERROR || current === ACK_TIMEOUT_ERROR
          ? null
          : current,
      );
    },
    [sessionId],
  );

  const adoptState = useCallback(
    (message: ThemeStateMessage) => {
      const byId = new Map(
        profilesRef.current.map((profile) => [profile.id, profile]),
      );
      for (const summary of message.profiles) {
        if (deletedRef.current.has(summary.id)) continue;
        const local = byId.get(summary.id);
        if (!local) continue;
        if (summary.updatedAt < local.updatedAt) continue;
        if (
          summary.name !== local.name ||
          summary.base !== local.base ||
          summary.updatedAt !== local.updatedAt
        ) {
          byId.set(summary.id, {
            ...local,
            name: summary.name,
            base: summary.base,
            updatedAt: summary.updatedAt,
          });
        }
      }
      const incoming = message.activeProfile;
      if (incoming && !deletedRef.current.has(incoming.id)) {
        const local = byId.get(incoming.id);
        const pending = timerRef.current !== null;
        if (!local || (!pending && incoming.updatedAt >= local.updatedAt)) {
          byId.set(incoming.id, incoming);
        }
      }
      const order = new Map(
        message.profiles.map((summary, index) => [summary.id, index]),
      );
      const list = Array.from(byId.values()).sort((a, b) => {
        const aOrder = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bOrder = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder;
      });
      profilesRef.current = list;
      setProfiles(list);
      const desired = desiredActiveRef.current;
      const nextActive = message.activeProfileId;
      if (desired) {
        if (nextActive === desired) desiredActiveRef.current = null;
        return;
      }
      let candidate = activeIdRef.current;
      if (nextActive && byId.has(nextActive)) candidate = nextActive;
      if (!candidate || !byId.has(candidate)) candidate = list[0]?.id ?? "";
      if (candidate !== activeIdRef.current) selectLocalActive(candidate);
    },
    [selectLocalActive],
  );

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    onThemeState((message) => {
      if (disposed) return;
      handleAck(message);
      adoptState(message);
    })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch((subscribeError: unknown) => {
        logDiagnostic("ThemeWindow.onThemeState", {
          error: String(subscribeError),
        });
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [adoptState, handleAck]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await loadSettings();
        if (cancelled) return;
        const loaded = sanitizeThemeProfiles(settings.themeProfiles);
        const storedActive = settings.activeThemeProfileId;
        const accent = normalizeHex(settings.accentColor, DEFAULT_ACCENT_HEX);
        const existing = profilesRef.current;
        const existingIds = new Set(existing.map((profile) => profile.id));
        const deduped =
          existing.length === 0
            ? loaded
            : [
                ...existing,
                ...loaded.filter((profile) => !existingIds.has(profile.id)),
              ];
        profilesRef.current = deduped;
        setProfiles(deduped);
        setAccentColor(accent);
        if (!activeIdRef.current) {
          const next =
            deduped.find((profile) => profile.id === storedActive) ??
            deduped[0] ??
            null;
          selectLocalActive(next?.id ?? "");
        }
      } catch (loadError) {
        if (!cancelled) {
          logDiagnostic("ThemeWindow.loadSettings", {
            error: String(loadError),
          });
          setError(
            "Custom themes could not be loaded. You can still create one.",
          );
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectLocalActive]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (ackTimerRef.current !== null) {
        window.clearTimeout(ackTimerRef.current);
        ackTimerRef.current = null;
      }
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (!pending) return;
      seqRef.current += 1;
      void emitThemeApply({
        kind: "upsert",
        sessionId,
        seq: seqRef.current,
        profile: pending,
        activateCustom: true,
      }).catch(() => undefined);
    };
  }, [sessionId]);

  const requestClose = useCallback(() => {
    if (closeGuardRef.current) return;
    closeGuardRef.current = true;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      void invoke("close_theme_window").catch(() => {
        closeGuardRef.current = false;
      });
    };
    const fallback = window.setTimeout(finish, CLOSE_TIMEOUT_MS);
    void flushPending().finally(() => {
      window.clearTimeout(fallback);
      finish();
    });
  }, [flushPending]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void getCurrentWindow()
      .onCloseRequested((event) => {
        if (closeGuardRef.current) return;
        event.preventDefault();
        requestClose();
      })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [requestClose]);

  const activeProfile = useMemo(
    () =>
      profiles.find((profile) => profile.id === activeId) ??
      profiles[0] ??
      null,
    [profiles, activeId],
  );

  useEffect(() => {
    if (!focusEmptyRef.current || profiles.length > 0) return;
    focusEmptyRef.current = false;
    emptyCreateRef.current?.focus();
  }, [profiles]);

  useEffect(() => {
    if (!focusNameRef.current || chooserOpen || !activeProfile) return;
    focusNameRef.current = false;
    document.querySelector<HTMLInputElement>(".theme-name-input")?.focus();
  }, [activeProfile, chooserOpen]);

  useEffect(() => {
    const titlebar = document.querySelector<HTMLElement>(".theme-titlebar");
    if (!titlebar) return;
    if (chooserOpen) titlebar.setAttribute("inert", "");
    else titlebar.removeAttribute("inert");
  }, [chooserOpen]);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
    };
    document.addEventListener("contextmenu", handleContextMenu);
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  useLayoutEffect(() => {
    if (!activeProfile) return;
    const root = document.documentElement;
    root.dataset.theme = activeProfile.base;
    const written = applyThemeTokens(
      activeProfile.tokens,
      activeProfile.base,
      { window: 1, panel: 1 },
      root,
    );
    return () => {
      clearThemeTokens(root, written);
      delete root.dataset.theme;
    };
  }, [activeProfile]);

  const handleSelect = useCallback(
    (id: string) => {
      if (id === activeIdRef.current) return;
      void flushPending();
      selectLocalActive(id);
      desiredActiveRef.current = id;
      const profile = profilesRef.current.find((entry) => entry.id === id);
      if (profile) sendUpsert(profile, true);
    },
    [flushPending, selectLocalActive, sendUpsert],
  );

  const handleCreateFromPreset = useCallback(
    (choice: TemplateChoice) => {
      if (profilesRef.current.length >= MAX_THEME_PROFILES) return;
      void flushPending();
      const profile =
        typeof choice === "string"
          ? createThemeProfile(
              choice,
              accentColor,
              nextThemeProfileName(profilesRef.current),
              newThemeProfileId(),
              Date.now(),
            )
          : createThemeProfileFromPreset(
              choice,
              uniqueThemeProfileName(choice.name, profilesRef.current),
              newThemeProfileId(),
              Date.now(),
            );
      const list = [...profilesRef.current, profile];
      profilesRef.current = list;
      setProfiles(list);
      selectLocalActive(profile.id);
      desiredActiveRef.current = profile.id;
      setChooserOpen(false);
      focusNameRef.current = true;
      setError(null);
      sendUpsert(profile, true);
    },
    [accentColor, flushPending, selectLocalActive, sendUpsert],
  );

  const handleDuplicate = useCallback(
    (id: string) => {
      void flushPending();
      const source = profilesRef.current.find((profile) => profile.id === id);
      if (!source || profilesRef.current.length >= MAX_THEME_PROFILES) return;
      const profile: ThemeProfile = {
        ...source,
        id: newThemeProfileId(),
        name: uniqueThemeProfileName(
          `${source.name} copy`,
          profilesRef.current,
        ),
        tokens: cloneThemeTokens(source.tokens),
        updatedAt: Date.now(),
      };
      const list = [...profilesRef.current, profile];
      profilesRef.current = list;
      setProfiles(list);
      selectLocalActive(profile.id);
      desiredActiveRef.current = profile.id;
      setError(null);
      sendUpsert(profile, true);
    },
    [flushPending, selectLocalActive, sendUpsert],
  );

  const handleRename = useCallback(
    (name: string) => {
      const trimmed = name.trim().slice(0, PROFILE_NAME_MAX_LENGTH);
      const current = profilesRef.current.find(
        (profile) => profile.id === activeIdRef.current,
      );
      if (!trimmed || !current || current.name === trimmed) return;
      editActive((profile) => ({ ...profile, name: trimmed }));
    },
    [editActive],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const current = profilesRef.current;
      if (timerRef.current !== null && pendingRef.current?.id === id) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
        pendingRef.current = null;
      }
      const next = current.filter((profile) => profile.id !== id);
      profilesRef.current = next;
      setProfiles(next);
      if (next.length === 0) focusEmptyRef.current = true;
      deletedRef.current.add(id);
      void sendMessage((seq) => ({
        kind: "delete",
        sessionId,
        seq,
        profileId: id,
      }));
      if (activeIdRef.current !== id) return;
      const fallback = next[0] ?? null;
      if (!fallback) {
        selectLocalActive("");
        return;
      }
      selectLocalActive(fallback.id);
      desiredActiveRef.current = fallback.id;
      sendUpsert(fallback, true);
    },
    [selectLocalActive, sendMessage, sendUpsert, sessionId],
  );

  const handleResetTemplate = useCallback(() => {
    const current = profilesRef.current.find(
      (profile) => profile.id === activeIdRef.current,
    );
    if (!current) return;
    const tokens = cloneThemeTokens(THEME_PALETTES[current.base]);
    editActive((profile) => ({ ...profile, tokens }));
  }, [editActive]);

  const handleColorChange = useCallback(
    (key: ThemeColorKey, color: ThemeColor) => {
      editActive((profile) => ({
        ...profile,
        tokens: { ...profile.tokens, [key]: color },
      }));
    },
    [editActive],
  );

  const handleRadiusChange = useCallback(
    (key: ThemeRadiusKey, value: number) => {
      editActive((profile) => ({
        ...profile,
        tokens: { ...profile.tokens, [key]: value },
      }));
    },
    [editActive],
  );

  const handleShadowChange = useCallback(
    (key: ThemeShadowKey, shadow: ThemeShadow | null) => {
      editActive((profile) => ({
        ...profile,
        tokens: { ...profile.tokens, [key]: shadow },
      }));
    },
    [editActive],
  );

  const handleResizeStart = () => {
    void getCurrentWindow()
      .startResizeDragging("SouthEast")
      .catch(() => undefined);
  };

  return (
    <div className="app-root theme-root">
      <ThemeTitleBar onClose={requestClose} />
      {error && (
        <div className="theme-error" role="alert">
          {error}
        </div>
      )}
      <div className="theme-body" inert={chooserOpen}>
        {!ready ? (
          <div className="theme-loading">Loading themes…</div>
        ) : profiles.length === 0 || !activeProfile ? (
          <div className="theme-empty">
            <span className="theme-empty-icon" aria-hidden="true">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
                <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
                <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
                <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
              </svg>
            </span>
            <h2 className="theme-empty-title">No custom themes yet</h2>
            <button
              ref={emptyCreateRef}
              type="button"
              className="theme-btn theme-btn--primary"
              aria-label="Create custom theme"
              onClick={() => setChooserOpen(true)}
            >
              Create custom theme
            </button>
          </div>
        ) : (
          <>
            <ProfileRail
              profiles={profiles}
              activeId={activeProfile.id}
              onSelect={handleSelect}
              onNew={() => setChooserOpen(true)}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
            />
            <section className="theme-editor" aria-label="Theme editor">
              <header className="theme-editor-header">
                <div className="theme-editor-heading">
                  <ProfileNameField
                    key={activeProfile.id}
                    value={activeProfile.name}
                    onChange={handleRename}
                  />
                  <span className="theme-editor-base">
                    Based on the {activeProfile.base} palette
                  </span>
                </div>
              </header>
              <div className="theme-page">
                <DesignPage
                  profile={activeProfile}
                  onColorChange={handleColorChange}
                  onRadiusChange={handleRadiusChange}
                  onShadowChange={handleShadowChange}
                  onResetTemplate={handleResetTemplate}
                />
              </div>
            </section>
          </>
        )}
      </div>
      <button
        type="button"
        className="theme-resize-grip"
        aria-label="Resize window"
        inert={chooserOpen}
        onPointerDown={(event) => {
          event.preventDefault();
          handleResizeStart();
        }}
      />
      {chooserOpen && (
        <TemplateChooser
          onPick={handleCreateFromPreset}
          onCancel={() => setChooserOpen(false)}
        />
      )}
    </div>
  );
}
