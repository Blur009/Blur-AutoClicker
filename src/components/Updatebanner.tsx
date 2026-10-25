import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { openUrl } from "@tauri-apps/plugin-opener";
import { logDiagnostic } from "../diagnostics";
import { invoke } from "@tauri-apps/api/core";
import { useRef, useState } from "react";

import { isPortableMode } from "../store";
import {
  compareVersions,
  parseChangelog,
  type ChangelogEntry,
} from "../changelog";
import UpdatePreviewModal from "./UpdatePreviewModal";
import UnavailableReason from "./UnavailableReason";
import "./Updatebanner.css";

const GITHUB_RELEASES_URL =
  "https://github.com/Blur009/Blur-AutoClicker/releases/latest";

interface UpdateBannerProps {
  currentVersion: string;
  latestVersion: string;
  portable?: boolean;
}

type UpdateStage = "ready" | "installing" | "restart-required" | "error";

export default function UpdateBanner({
  currentVersion,
  latestVersion,
  portable = false,
}: UpdateBannerProps) {
  const [stage, setStage] = useState<UpdateStage>("ready");
  const [statusText, setStatusText] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewEntries, setPreviewEntries] = useState<ChangelogEntry[] | null>(
    null,
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const previewFetchedRef = useRef(false);

  const handlePreview = async () => {
    if (previewOpen) {
      setPreviewOpen(false);
      return;
    }
    setPreviewOpen(true);
    if (previewFetchedRef.current) return;

    setPreviewLoading(true);
    setPreviewError(false);
    try {
      const raw = await invoke<string>("fetch_changelog");
      const all = parseChangelog(raw);
      const newer = all.filter(
        (entry) => compareVersions(entry.version, currentVersion) > 0,
      );
      setPreviewEntries(newer.length > 0 ? newer : all.slice(0, 1));
      previewFetchedRef.current = true;
    } catch (err) {
      logDiagnostic("Updatebanner.changelogPreview", {
        error: String(err),
      });
      setPreviewError(true);
    } finally {
      setPreviewLoading(false);
    }
  };

  const openReleasePage = async () => {
    try {
      await openUrl(GITHUB_RELEASES_URL);
    } catch (err) {
      logDiagnostic("Updatebanner.openRelease", {
        error: String(err),
      });
      setStage("error");
      setStatusText("Could not open the download page.");
    }
  };

  const handleUpdate = async () => {
    if (portable) {
      await openReleasePage();
      return;
    }

    // Guard against the brief window where `portable` is still the false
    // default while the real get_app_info result is in flight.
    try {
      if (await isPortableMode()) {
        await openUrl(GITHUB_RELEASES_URL);
        return;
      }
    } catch (err) {
      logDiagnostic("Updatebanner.openRelease", {
        error: String(err),
      });
      setStage("error");
      setStatusText("Update check failed. Try again.");
      return;
    }

    try {
      setStage("installing");
      setStatusText("Preparing update...");

      const update = await check();
      if (!update) {
        setStage("ready");
        setStatusText("Update is no longer available.");
        return;
      }

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            setStatusText("Downloading update...");
            break;
          case "Progress":
            setStatusText("Installing update...");
            break;
          case "Finished":
            setStatusText("Update installed. Restart to apply it.");
            break;
        }
      });

      setStage("restart-required");
      setStatusText("Update installed. Restart to apply it.");
    } catch (err) {
      logDiagnostic("Updatebanner.install", {
        error: String(err),
      });
      setStage("error");
      setStatusText("Update install failed.");
    }
  };

  const handleRestart = async () => {
    try {
      await relaunch();
    } catch (err) {
      logDiagnostic("Updatebanner.relaunch", {
        error: String(err),
      });
      setStage("error");
      setStatusText("Restart failed. Please reopen the app manually.");
    }
  };

  const installDisabledReason =
    stage === "installing"
      ? statusText === "Installing update..."
        ? "The update is already installing. Wait for it to finish before trying again."
        : statusText === "Downloading update..."
          ? "The update is already downloading. Wait for the current install to finish."
          : "The update is already being prepared. Wait for it to finish before trying again."
      : undefined;

  return (
    <div className="update-banner">
      <span className="update-banner-text-old-version">v{currentVersion}</span>
      <span className="update-banner-text">to</span>
      {/* does not need v for version, gets it from gitHub ↓  */}
      <span className="update-banner-text-new-version">{latestVersion}</span>
      {statusText && (
        <span className="update-banner-status" data-stage={stage}>
          {statusText}
        </span>
      )}
      {stage === "restart-required" ? (
        <button className="update-banner-btn" onClick={handleRestart}>
          Restart to Apply Update
        </button>
      ) : (
        <UnavailableReason
          reason={portable ? undefined : installDisabledReason}
        >
          <button
            className="update-banner-btn"
            onClick={handleUpdate}
            disabled={!portable && stage === "installing"}
          >
            {portable
              ? "Download from GitHub"
              : stage === "installing"
                ? "Installing..."
                : "Download and Install"}
          </button>
        </UnavailableReason>
      )}
      {stage !== "restart-required" && (
        <button
          className="update-banner-btn update-banner-preview-btn"
          onClick={handlePreview}
        >
          Preview Changes
        </button>
      )}
      <UpdatePreviewModal
        open={previewOpen}
        currentVersion={currentVersion}
        latestVersion={latestVersion}
        loading={previewLoading}
        error={previewError}
        entries={previewEntries}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
