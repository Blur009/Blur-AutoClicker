import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { logDiagnostic } from "../../../../diagnostics";
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
        title="Reset"
        description="Reset all settings or usage data."
      >
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Reset All Settings</span>
            <span className="settings-sublabel">
              Every setting back to default, saved presets included.
            </span>
          </div>
          <button
            className="settings-btn-danger"
            onClick={() => setPendingAction("reset-settings")}
          >
            Reset
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Reset Usage Data</span>
            <span className="settings-sublabel">
              Delete the sessions behind the Usage card.
            </span>
          </div>
          <button
            className="settings-btn-danger"
            onClick={() => setPendingAction("reset-usage")}
          >
            Reset
          </button>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Diagnostics"
        description="Logs and crash reports kept on this PC."
      >
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Diagnostics</span>
            <span className="settings-sublabel">
              Open the folder or export a copy.
            </span>
          </div>
          <div className="settings-row-actions">
            <button
              className="settings-btn-secondary"
              onClick={async () => {
                try {
                  await invoke("open_diagnostics_folder");
                } catch (err) {
                  logDiagnostic("SettingsPanel.openDiagnostics", {
                    error: String(err),
                  });
                }
              }}
            >
              Open Folder
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
                  setDiagnosticsStatus(`Exported to ${path}`);
                } catch (err) {
                  setDiagnosticsStatus("Export failed");
                  logDiagnostic("SettingsPanel.exportDiagnostics", {
                    error: String(err),
                  });
                } finally {
                  setExporting(false);
                }
              }}
            >
              {exporting ? "Exporting..." : "Export"}
            </button>
          </div>
        </div>
        {diagnosticsStatus && (
          <span className="settings-note">{diagnosticsStatus}</span>
        )}
      </SettingsCard>

      <ConfirmDialog
        open={pendingAction === "reset-settings"}
        title="Reset all settings"
        message="Every setting returns to its default, saved presets are replaced, and Run on Startup is turned off. This cannot be undone."
        confirmLabel="Reset"
        busy={busy}
        onConfirm={handleConfirmResetSettings}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmDialog
        open={pendingAction === "reset-usage"}
        title="Reset usage data"
        message="Every recorded session is deleted, so the usage charts and totals start over. This cannot be undone."
        confirmLabel="Reset"
        busy={busy}
        onConfirm={handleConfirmResetUsage}
        onCancel={() => setPendingAction(null)}
      />
    </>
  );
}
