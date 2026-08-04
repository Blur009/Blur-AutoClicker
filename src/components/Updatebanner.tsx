import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { error } from "@tauri-apps/plugin-log";
import { useState } from "react";

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
  const [statusText, setStatusText] = useState<string | null>(null);

  const handleUpdate = async () => {
    try {
      setStage("installing");
      setStatusText("업데이트 준비 중...");

      const update = await check();
      if (!update) {
        setStage("ready");
        setStatusText("업데이트를 더 이상 사용할 수 없습니다.");
        return;
      }

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            setStatusText("업데이트 다운로드 중...");
            break;
          case "Progress":
            setStatusText("업데이트 설치 중...");
            break;
          case "Finished":
            setStatusText("업데이트 설치 완료. 적용하려면 다시 시작하세요.");
            break;
        }
      });

      setStage("restart-required");
      setStatusText("업데이트 설치 완료. 적용하려면 다시 시작하세요.");
    } catch (err) {
      error(
        JSON.stringify({ source: "Updatebanner.install", error: String(err) }),
      );
      setStage("error");
      setStatusText("업데이트 설치에 실패했습니다.");
    }
  };

  const handleRestart = async () => {
    try {
      await relaunch();
    } catch (err) {
      error(
        JSON.stringify({ source: "Updatebanner.relaunch", error: String(err) }),
      );
      setStage("error");
      setStatusText("다시 시작하지 못했습니다. 앱을 수동으로 다시 열어 주세요.");
    }
  };

  const installDisabledReason =
    stage === "installing"
      ? statusText === "업데이트 설치 중..."
        ? "업데이트를 설치하고 있습니다. 완료될 때까지 기다려 주세요."
        : statusText === "업데이트 다운로드 중..."
          ? "업데이트를 다운로드하고 있습니다. 현재 설치가 끝날 때까지 기다려 주세요."
          : "업데이트를 준비하고 있습니다. 완료될 때까지 기다려 주세요."
      : undefined;

  return (
    <div className="update-banner">
      <span className="update-banner-text-old-version">v{currentVersion}</span>
      <span className="update-banner-text">→</span>
      {/* does not need v for version, gets it from gitHub ↓  */}
      <span className="update-banner-text-new-version">{latestVersion}</span>
      {statusText && (
        <span className="update-banner-status" data-stage={stage}>
          {statusText}
        </span>
      )}
      {stage === "restart-required" ? (
        <button className="update-banner-btn" onClick={handleRestart}>
          다시 시작하여 업데이트 적용
        </button>
      ) : (
        <UnavailableReason reason={installDisabledReason}>
          <button
            className="update-banner-btn"
            onClick={handleUpdate}
            disabled={stage === "installing"}
          >
            {stage === "installing" ? "설치 중..." : "다운로드 및 설치"}
          </button>
        </UnavailableReason>
      )}
    </div>
  );
}
