import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { AppInfo } from "../../../../store";
import { changelogEntries } from "../../../../changelog";
import ChangelogContent from "../../../ChangelogContent";
import { SettingsCard } from "./shared";

interface CumulativeStats {
  totalClicks: number;
  totalTimeSecs: number;
  totalSessions: number;
  avgCpu: number;
}

function formatTime(totalSeconds: number, language: string): string {
  if (totalSeconds < 0.01) return "0s";
  if (totalSeconds < 60) {
    return `${Math.floor(totalSeconds).toLocaleString(language)}s`;
  }
  if (totalSeconds < 3600) {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${m.toLocaleString(language)}m ${s.toLocaleString(language)}s`;
  }
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${h.toLocaleString(language)}h ${m.toLocaleString(language)}m ${s.toLocaleString(language)}s`;
}

function formatNumber(n: number, language: string): string {
  return Math.floor(n).toLocaleString(language);
}

function formatCpu(
  cpu: number,
  language: string,
  notAvailable: string,
): string {
  if (!Number.isFinite(cpu) || cpu < 0) return notAvailable;
  return `${cpu.toLocaleString(language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

interface Props {
  appInfo: AppInfo;
  updateCheckStatus:
    "idle" | "checking" | "available" | "unavailable" | "error";
  onCheckForUpdate: () => void;
}

const UPDATE_BUTTON_LABELS = {
  idle: "Check for Update",
  checking: "Checking...",
  available: "Update found!",
  unavailable: "No update found",
  error: "Check failed",
} as const;

const KOFI_URL = "https://ko-fi.com/Z8Z71T8QD4";
const YOUTUBE_URL = "https://youtube.com/@Blur009";
const TWITCH_URL = "https://twitch.tv/Blur009";
const GITHUB_URL = "https://github.com/Blur009/Blur-AutoClicker";

const KOFI_IMG_STYLE: CSSProperties = { border: 0, height: "28px" };

const UsageStatsGrid = memo(function UsageStatsGrid({
  formatted,
}: {
  formatted: {
    totalClicks: string;
    totalTime: string;
    avgCpu: string;
    sessions: string;
  };
}) {
  return (
    <div className="stats-grid">
      <div className="stats-cell">
        <span className="stats-cell-label">Total Clicks</span>
        <span className="stats-cell-value">{formatted.totalClicks}</span>
      </div>
      <div className="stats-cell">
        <span className="stats-cell-label">Total Clicking Time</span>
        <span className="stats-cell-value">{formatted.totalTime}</span>
      </div>
      <div className="stats-cell">
        <span className="stats-cell-label">Average CPU Usage</span>
        <span className="stats-cell-value">{formatted.avgCpu}</span>
      </div>
      <div className="stats-cell">
        <span className="stats-cell-label">Clicking Sessions</span>
        <span className="stats-cell-value">{formatted.sessions}</span>
      </div>
    </div>
  );
});

function useAnimatedNumber(target: number, duration = 600) {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  useEffect(() => {
    const from = displayRef.current;
    if (from === target) return;
    const instant =
      duration <= 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = instant ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (target - from) * eased;
      displayRef.current = current;
      setDisplay(current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return display;
}

export default function GeneralSection({
  appInfo,
  updateCheckStatus,
  onCheckForUpdate,
}: Props) {
  const [stats, setStats] = useState<CumulativeStats | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const language = "en";

  useEffect(() => {
    invoke<CumulativeStats>("get_stats")
      .then(setStats)
      .catch(() => {});

    let cleanup: (() => void) | undefined;
    listen<CumulativeStats>("stats-updated", (event) => {
      setStats(event.payload);
    })
      .then((unlisten) => {
        cleanup = unlisten;
      })
      .catch(() => {});

    return () => {
      cleanup?.();
    };
  }, []);

  const hasStats = stats !== null && stats.totalSessions > 0;

  const animatedClicks = useAnimatedNumber(stats?.totalClicks ?? 0);
  const animatedTime = useAnimatedNumber(stats?.totalTimeSecs ?? 0);
  const animatedCpu = useAnimatedNumber(stats?.avgCpu ?? 0);
  const animatedSessions = useAnimatedNumber(stats?.totalSessions ?? 0);

  const formattedStats = useMemo(() => {
    if (stats === null || stats.totalSessions <= 0) return null;
    return {
      totalClicks: formatNumber(animatedClicks, language),
      totalTime: formatTime(animatedTime, language),
      avgCpu: formatCpu(animatedCpu, language, "N/A"),
      sessions: formatNumber(animatedSessions, language),
    };
  }, [
    stats,
    language,
    animatedClicks,
    animatedTime,
    animatedCpu,
    animatedSessions,
  ]);

  const updateButtonLabel = UPDATE_BUTTON_LABELS[updateCheckStatus];

  const toggleChangelog = useCallback(() => setShowChangelog((v) => !v), []);

  const openKofi = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    void openUrl(KOFI_URL);
  }, []);
  const openYoutube = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    void openUrl(YOUTUBE_URL);
  }, []);
  const openTwitch = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    void openUrl(TWITCH_URL);
  }, []);
  const openGithub = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    void openUrl(GITHUB_URL);
  }, []);

  return (
    <>
      <SettingsCard title="About" description="Version and project links.">
        <div className="social-links">
          <span className="settings-label">Support Me</span>
          <div className="social-icons">
            <a
              className="social-icon social-icon--kofi"
              href="#"
              title="Ko-fi"
              onClick={openKofi}
            >
              <img
                height="28"
                style={KOFI_IMG_STYLE}
                src="https://storage.ko-fi.com/cdn/kofi3.png?v=6"
                alt="Buy Me a Coffee at ko-fi.com"
              />
            </a>
            <a
              className="social-icon social-icon--youtube"
              href="#"
              title="YouTube"
              onClick={openYoutube}
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="18"
                height="18"
              >
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            </a>
            <a
              className="social-icon social-icon--twitch"
              href="#"
              title="Twitch"
              onClick={openTwitch}
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="18"
                height="18"
              >
                <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
              </svg>
            </a>
            <a
              className="social-icon social-icon--github"
              href="#"
              title="GitHub"
              onClick={openGithub}
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="18"
                height="18"
              >
                <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.2.8-.6v-2c-3.3.7-4-1.4-4-1.4-.5-1.3-1.2-1.7-1.2-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 .1.8 1.8 3.4 1.2.1-.7.4-1.2.7-1.5-2.7-.3-5.4-1.3-5.4-6a4.7 4.7 0 0 1 1.2-3.2c-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.2 11.2 0 0 1 6.1 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2a4.7 4.7 0 0 1 1.2 3.2c0 4.7-2.8 5.7-5.4 6 .4.3.8 1 .8 2.1v3.1c0 .4.2.7.8.6A12 12 0 0 0 12 .3" />
              </svg>
            </a>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-label-group settings-label-group--inline">
            <span className="settings-label">Version</span>
            <span className="settings-value">
              v{appInfo.version}
              {appInfo.portable ? " portable (no auto update)" : ""}
            </span>
          </div>
          <div className="settings-row-actions">
            <button
              className="settings-btn-secondary changelog-toggle-btn"
              onClick={toggleChangelog}
            >
              <svg
                className={`changelog-arrow${showChangelog ? " open" : ""}`}
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
              >
                <path
                  d="M3 1L7 5L3 9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {showChangelog ? "Hide Changes" : "Show Changes"}
            </button>
            <button
              className="settings-btn-secondary check-update-btn"
              onClick={onCheckForUpdate}
              disabled={updateCheckStatus !== "idle"}
            >
              {updateButtonLabel}
            </button>
          </div>
        </div>
        {showChangelog && <ChangelogContent entries={changelogEntries} />}
      </SettingsCard>

      <SettingsCard
        title="Usage"
        description="Clicking statistics for all sessions (only stored locally)."
      >
        {hasStats && formattedStats ? (
          <UsageStatsGrid formatted={formattedStats} />
        ) : (
          <div className="stats-empty">No session data yet.</div>
        )}
      </SettingsCard>
    </>
  );
}
