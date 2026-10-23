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
                <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.2.8-.6v-2c-3.3.7-4-1.4-4-1.4-.5-1.3-1.2-1.7-1.2-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 .1.8 1.8 3.4 1.2.1-.7.4-1.2.7-1.5-2.7-.3-5.4-1.3-5.4-6a4.7 4.7 0 0 1 1.2-3.2c-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.2 11.2 0 0 1 6.1 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2a4.7 4.7 0 0 1 1.2 3.2c0 4.7-2.8 5.7-5.4 6 .4.3.8 1 .8 2.1v3.1c0 .4.2.7.8.6A12 12 0 0 0 12 .3" />
              </svg>
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
