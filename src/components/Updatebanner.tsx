import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { useState } from "react";
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
  const [statusText, setStatusText] = useState<string | null>(null);

  const handleUpdate = async () => {
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
      console.error("Failed to install update:", err);
      setStage("error");
      setStatusText("Update install failed.");
    }
  };

  const handleRestart = async () => {
    try {
      await relaunch();
    } catch (err) {
      console.error("Failed to relaunch app:", err);
      setStage("error");
      setStatusText("Restart failed. Please reopen the app manually.");
    }
  };

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
        <button
          className="update-banner-btn"
          onClick={handleUpdate}
          disabled={stage === "installing"}
        >
          {stage === "installing" ? "Installing..." : "Download and Install"}
        </button>
      )}
    </div>
  );
}
