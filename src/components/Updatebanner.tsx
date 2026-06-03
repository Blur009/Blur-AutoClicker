import { useTranslation } from "../i18n";
import "./Updatebanner.css";

interface UpdateBannerProps {
  currentVersion: string;
  latestVersion: string;
}

export default function UpdateBanner({
  currentVersion,
  latestVersion,
}: UpdateBannerProps) {
  const { t } = useTranslation();

  const handleDownload = () => {
    window.open(
      `https://github.com/MrSchnirschuh/MrSchnirschuhHub/releases/tag/${latestVersion}`,
      "_blank",
    );
  };

  return (
    <div className="update-banner">
      <span className="update-banner-text-old-version">v{currentVersion}</span>
      <span className="update-banner-text">{t("update.to")}</span>
      <span className="update-banner-text-new-version">{latestVersion}</span>
      <button className="update-banner-btn" onClick={handleDownload}>
        {t("update.downloadAndInstall")}
      </button>
    </div>
  );
}