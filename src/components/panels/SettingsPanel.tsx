import "./SettingsPanel.css";
import type { AppInfo, Settings } from "../../store";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-shell";

interface CumulativeStats {
  totalClicks: number;
  totalTimeSecs: number;
  totalSessions: number;
  avgCpu: number;
}

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  appInfo: AppInfo;
  onReset: () => Promise<void>;
}

function formatTime(totalSeconds: number): string {
  if (totalSeconds < 0.01) return "0s";
  if (totalSeconds < 60) {
    return `${Math.floor(totalSeconds)}s`;
  }
  if (totalSeconds < 3600) {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatNumber(n: number): string {
  return Math.floor(n).toLocaleString();
}

function formatCpu(cpu: number): string {
  if (cpu < 0) return "N/A";
  return `${cpu.toFixed(1)}%`;
}

export default function SettingsPanel({
  settings,
  update,
  appInfo,
  onReset,
}: Props) {
  const [resetting, setResetting] = useState(false);
  // const [resettingStats, setResettingStats] = useState(false);
  const [stats, setStats] = useState<CumulativeStats | null>(null);
  const [atBottom, setAtBottom] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<CumulativeStats>("get_stats")
      .then(setStats)
      .catch(() => {});
  }, []);

  const handleScroll = () => {
    const el = panelRef.current;
    if (!el) return;
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
  };

  const hasStats = stats !== null && stats.totalSessions > 0;

  return (
    <div className="settings-wrapper">
      <div className="settings-panel" ref={panelRef} onScroll={handleScroll}>
        <div className="social-links">
          <span className="settings-label">Support Me</span>
          <div className="social-icons">
            <a
              className="social-icon social-icon--youtube"
              href="#"
              title="YouTube"
              onClick={(e) => {
                e.preventDefault();
                open("https://youtube.com/@Blur009");
              }}
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
              onClick={(e) => {
                e.preventDefault();
                open("https://twitch.tv/Blur009");
              }}
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
              onClick={(e) => {
                e.preventDefault();
                open("https://github.com/Blur009/Blur-AutoClicker");
              }}
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
            <a
              className="social-icon social-icon--kofi"
              href="#"
              title="Ko-fi"
              onClick={(e) => {
                e.preventDefault();
                open("https://ko-fi.com/Blur009");
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="18"
                height="18"
              >
                <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311zm6.173.478c-.928.116-1.682.028-1.682.028V7.284h1.77s1.971.551 1.971 2.638c0 1.913-.985 2.667-2.059 3.015z" />
              </svg>
            </a>
            <a
              className="social-icon social-icon--patreon"
              href="#"
              title="Patreon"
              onClick={(e) => {
                e.preventDefault();
                open("https://patreon.com/Blur009");
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="18"
                height="18"
              >
                <path d="M15.386.524c-4.764 0-8.64 3.876-8.64 8.64 0 4.75 3.876 8.613 8.64 8.613 4.75 0 8.614-3.864 8.614-8.613C24 4.4 20.136.524 15.386.524zM.003 23.537h4.22V.524H.003z" />
              </svg>
            </a>
          </div>
        </div>

        {/* <div className="settings-divider" /> */}
        <div className="settings-row">
          <span className="settings-label">Version</span>
          <span className="settings-value">v{appInfo.version}</span>
        </div>

        <div className="settings-divider" />

        {/* -- Your Usage Data -- */}

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Your Usage Data</span>
            <span className="settings-sublabel">
              Your personal clicker stats, tracked locally.
            </span>
          </div>
          {/* <button
            className="settings-btn-danger"
            onClick={() => {
              setResettingStats(true);
              invoke<CumulativeStats>("reset_stats")
                .then(setStats)
                .finally(() => setResettingStats(false));
            }}
          >
            {resettingStats ? "Clearing..." : "Clear"}
          </button> */}
          {/* TODO: BUTTON DISABLED FOR NOW UNTIL I MAKE A CONFIRMATION PROMPT */}
        </div>
        {hasStats ? (
          <>
            <div className="stats-grid">
              <div className="stats-cell">
                <span className="stats-cell-label">Total Clicks</span>
                <span className="stats-cell-value">
                  {formatNumber(stats.totalClicks)}
                </span>
              </div>
              <div className="stats-cell">
                <span className="stats-cell-label">
                  Total Time spent clicking
                </span>
                <span className="stats-cell-value">
                  {formatTime(stats.totalTimeSecs)}
                </span>
              </div>
              <div className="stats-cell">
                <span className="stats-cell-label">
                  CPU Usage avg
                </span>
                <span className="stats-cell-value">
                  {formatCpu(stats.avgCpu)}
                </span>
              </div>
              <div className="stats-cell">
                <span className="stats-cell-label">Sessions</span>
                <span className="stats-cell-value">{stats.totalSessions}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="stats-empty">No runs recorded yet</div>
        )}

        <div className="settings-divider" />

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Stop Hitbox Overlay</span>
            <span className="settings-sublabel">
              Toggles whether the stop hitbox overlay is shown.
            </span>
          </div>
          <div className="settings-seg-group">
            {["On", "Off"].map((o) => (
              <button
                key={o}
                className={`settings-seg-btn ${(settings.showStopOverlay ? "On" : "Off") === o ? "active" : ""}`}
                onClick={() => update({ showStopOverlay: o === "On" })}
              >
                {o}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Stop Reason Alert</span>
            <span className="settings-sublabel">
              Shows why the clicker stopped in the title bar.
            </span>
          </div>
          <div className="settings-seg-group">
            {["On", "Off"].map((o) => (
              <button
                key={o}
                className={`settings-seg-btn ${(settings.showStopReason ? "On" : "Off") === o ? "active" : ""}`}
                onClick={() => update({ showStopReason: o === "On" })}
              >
                {o}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-divider" />
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Theme</span>
            <span className="settings-sublabel">
              Switch between Dark and light themes.
            </span>
          </div>
          <div className="settings-seg-group">
            {(["Dark", "Light"] as const).map((o) => (
              <button
                key={o}
                className={`settings-seg-btn ${(settings.theme === "light" ? "Light" : "Dark") === o ? "active" : ""}`}
                onClick={() => update({ theme: o.toLowerCase() as "dark" | "light" })}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-divider" />
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Reset All Settings</span>
            <span className="settings-sublabel">
              Will reset all input fields and settings to the Defaults.
            </span>
          </div>
          <button
            className="settings-btn-danger"
            onClick={() => {
              setResetting(true);
              onReset().finally(() => setResetting(false));
            }}
          >
            {resetting ? "Resetting..." : "Reset"}
          </button>
        </div>
      </div>
      <div
        className={`settings-fade ${atBottom ? "settings-fade--hidden" : ""}`}
      ></div>
    </div>
  );
}
