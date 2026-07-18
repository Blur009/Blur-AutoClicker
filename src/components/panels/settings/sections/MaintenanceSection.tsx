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
        title="Reset"
        description="Reset all settings or usage data."
      >
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Reset All Settings</span>
            <span className="settings-sublabel">
              Reset all settings to their defaults.
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
              Clear all session statistics and usage history.
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

      <SettingsCard title="Diagnostics" description="Your logs & crash reports">
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Diagnostics</span>
            <span className="settings-sublabel">
              View or export your diagnostics.
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
        message="This will reset all settings to their default values. This action cannot be undone."
        confirmLabel="Reset"
        busy={busy}
        onConfirm={handleConfirmResetSettings}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmDialog
        open={pendingAction === "reset-usage"}
        title="Reset usage data"
        message="This will clear all session statistics and usage history. This action cannot be undone."
        confirmLabel="Reset"
        busy={busy}
        onConfirm={handleConfirmResetUsage}
        onCancel={() => setPendingAction(null)}
      />
    </>
  );
}
