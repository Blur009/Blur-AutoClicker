import { check } from "@tauri-apps/plugin-updater";
import "./Updatebanner.css";

interface UpdateBannerProps {
  currentVersion: string;
  latestVersion: string;
}

export default function UpdateBanner({
  currentVersion,
  latestVersion,
}: UpdateBannerProps) {
  const handleUpdate = async () => {
    const update = await check();
    if (update) {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            break;
          case "Progress":
            break;
          case "Finished":
            break;
        }
      });
    }
  };

  return (
    <div className="update-banner">
      <span className="update-banner-text-old-version">v{currentVersion}</span>
      <span className="update-banner-text">→</span>
      <span className="update-banner-text-new-version">{latestVersion}</span>
      <button className="update-banner-btn" onClick={handleUpdate}>
        Télécharger et installer la mise à jour
      </button>
    </div>
  );
}
