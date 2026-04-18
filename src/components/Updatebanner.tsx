import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { useState } from "react";
import { useTranslation, type TranslationKey } from "../i18n";
import UnavailableReason from "./UnavailableReason";
import "./Updatebanner.css";

interface UpdateBannerProps {
  currentVersion: string;
  latestVersion: string;
}

type UpdateStage = "ready" | "installing" | "restart-required" | "error";

export default function UpdateBanner({
  currentVersion,
  latestVersion,
}: UpdateBannerProps) {
  const [stage, setStage] = useState<UpdateStage>("ready");
  const [statusKey, setStatusKey] = useState<TranslationKey | null>(null);
  const { t } = useTranslation();

  const handleUpdate = async () => {
    try {
      setStage("installing");
      setStatusKey("update.preparing");

      const update = await check();
      if (!update) {
        setStage("ready");
        setStatusKey("update.notAvailable");
        return;
      }

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            setStatusKey("update.downloading");
            break;
          case "Progress":
            setStatusKey("update.installing");
            break;
          case "Finished":
            setStatusKey("update.installedRestart");
            break;
        }
      });

      setStage("restart-required");
      setStatusKey("update.installedRestart");
    } catch (err) {
      console.error("Failed to install update:", err);
      setStage("error");
      setStatusKey("update.installFailed");
    }
  };

  const handleRestart = async () => {
    try {
      await relaunch();
    } catch (err) {
      console.error("Failed to relaunch app:", err);
      setStage("error");
      setStatusKey("update.restartFailed");
    }
  };

  const installDisabledReason =
    stage === "installing"
      ? statusKey === "update.installing"
        ? t("update.installAlreadyInstalling")
        : statusKey === "update.downloading"
          ? t("update.installAlreadyDownloading")
          : t("update.installAlreadyPreparing")
      : undefined;

  return (
    <div className="update-banner">
      <span className="update-banner-text-old-version">v{currentVersion}</span>
      <span className="update-banner-text">{t("update.to")}</span>
      {/* does not need v for version, gets it from gitHub ↓  */}
      <span className="update-banner-text-new-version">{latestVersion}</span>
      {statusKey && (
        <span className="update-banner-status" data-stage={stage}>
          {t(statusKey)}
        </span>
      )}
      {stage === "restart-required" ? (
        <button className="update-banner-btn" onClick={handleRestart}>
          {t("update.restartToApply")}
        </button>
      ) : (
        <UnavailableReason reason={installDisabledReason}>
          <button
            className="update-banner-btn"
            onClick={handleUpdate}
            disabled={stage === "installing"}
          >
            {stage === "installing"
              ? t("update.installingButton")
              : t("update.downloadAndInstall")}
          </button>
        </UnavailableReason>
      )}
    </div>
  );
}
