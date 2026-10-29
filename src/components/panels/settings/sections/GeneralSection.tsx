import {
  useCallback,
  useEffect,
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
import DiscordIcon from "../../../DiscordIcon";
import UsageCard from "./UsageStats";
import type { StatsOverview } from "./usageSeries";
import { SettingsCard } from "./shared";

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
const DISCORD_URL = "https://discord.gg/jhWEW747x5";

const KOFI_IMG_STYLE: CSSProperties = { border: 0, height: "28px" };

export default function GeneralSection({
  appInfo,
  updateCheckStatus,
  onCheckForUpdate,
}: Props) {
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);

  useEffect(() => {
    const load = () => {
      invoke<StatsOverview>("get_stats_overview")
        .then(setOverview)
        .catch(() => {});
    };

    load();

    let cleanup: (() => void) | undefined;
    listen("stats-updated", load)
      .then((unlisten) => {
        cleanup = unlisten;
      })
      .catch(() => {});

    return () => {
      cleanup?.();
    };
  }, []);

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
  const openDiscord = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    void openUrl(DISCORD_URL);
  }, []);

  return (
    <>
      <SettingsCard>
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
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
            </a>
            <a
              className="social-icon social-icon--discord"
              href="#"
              title="Discord"
              onClick={openDiscord}
            >
              <DiscordIcon size={18} />
            </a>
          </div>
        </div>
        <div className="settings-row settings-row--inline settings-row--reveal">
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
              aria-expanded={showChangelog}
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
        <div
          className={`changelog-reveal${showChangelog ? " changelog-reveal--open" : ""}`}
        >
          <div className="changelog-reveal-inner">
            <ChangelogContent entries={changelogEntries} />
          </div>
        </div>
      </SettingsCard>

      <UsageCard overview={overview} />
    </>
  );
}
