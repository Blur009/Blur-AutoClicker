import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { error } from "@tauri-apps/plugin-log";
import ConfirmDialog from "../../../ConfirmDialog";
import { SettingsCard } from "./shared";

interface CumulativeStats {
  totalClicks: number;
  totalTimeSecs: number;
  totalSessions: number;
  avgCpu: number;
}

interface Props {
  onReset: () => Promise<void>;
}

export default function MaintenanceSection({ onReset }: Props) {
  const [pendingAction, setPendingAction] = useState<
    "reset-settings" | "reset-usage" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [diagnosticsStatus, setDiagnosticsStatus] = useState<string | null>(
    null,
  );
  const [exporting, setExporting] = useState(false);

  const handleConfirmResetSettings = async () => {
    setBusy(true);
    try {
      await onReset();
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  };

  const handleConfirmResetUsage = async () => {
    setBusy(true);
    try {
      await invoke<CumulativeStats>("reset_stats");
    } catch {
      // ignore
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  };

  return (
    <>
      <SettingsCard
        title="초기화"
        description="모든 설정 또는 사용량 데이터를 초기화합니다."
      >
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">모든 설정 초기화</span>
            <span className="settings-sublabel">
              모든 설정을 기본값으로 되돌립니다.
            </span>
          </div>
          <button
            className="settings-btn-danger"
            onClick={() => setPendingAction("reset-settings")}
          >
            초기화
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">사용량 데이터 초기화</span>
            <span className="settings-sublabel">
              모든 세션 통계와 사용 기록을 삭제합니다.
            </span>
          </div>
          <button
            className="settings-btn-danger"
            onClick={() => setPendingAction("reset-usage")}
          >
            초기화
          </button>
        </div>
      </SettingsCard>

      <SettingsCard title="진단" description="로그 및 충돌 보고서입니다.">
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">진단</span>
            <span className="settings-sublabel">
              진단 정보를 확인하거나 내보냅니다.
            </span>
          </div>
          <div className="settings-row-actions">
            <button
              className="settings-btn-secondary"
              onClick={async () => {
                try {
                  await invoke("open_diagnostics_folder");
                } catch (err) {
                  error(
                    JSON.stringify({
                      source: "SettingsPanel.openDiagnostics",
                      error: String(err),
                    }),
                  );
                }
              }}
            >
              폴더 열기
            </button>
            <button
              className="settings-btn-secondary"
              disabled={exporting}
              onClick={async () => {
                setExporting(true);
                setDiagnosticsStatus(null);
                try {
                  const path: string = await invoke(
                    "export_diagnostics_bundle",
                  );
                  setDiagnosticsStatus(`다음 경로로 내보냈습니다: ${path}`);
                } catch (err) {
                  setDiagnosticsStatus("내보내기에 실패했습니다.");
                  error(
                    JSON.stringify({
                      source: "SettingsPanel.exportDiagnostics",
                      error: String(err),
                    }),
                  );
                } finally {
                  setExporting(false);
                }
              }}
            >
              {exporting ? "내보내는 중..." : "내보내기"}
            </button>
          </div>
        </div>
        {diagnosticsStatus && (
          <span className="settings-note">{diagnosticsStatus}</span>
        )}
      </SettingsCard>

      <ConfirmDialog
        open={pendingAction === "reset-settings"}
        title="모든 설정을 초기화할까요?"
        message="모든 설정을 기본값으로 되돌립니다. 이 작업은 취소할 수 없습니다."
        confirmLabel="초기화"
        busy={busy}
        onConfirm={handleConfirmResetSettings}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmDialog
        open={pendingAction === "reset-usage"}
        title="사용량 데이터를 초기화할까요?"
        message="모든 세션 통계와 사용 기록을 삭제합니다. 이 작업은 취소할 수 없습니다."
        confirmLabel="초기화"
        busy={busy}
        onConfirm={handleConfirmResetUsage}
        onCancel={() => setPendingAction(null)}
      />
    </>
  );
}
