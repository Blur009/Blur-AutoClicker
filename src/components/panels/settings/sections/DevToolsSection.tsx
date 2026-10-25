import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ChangelogEntry } from "../../../../changelog";
import ElevationPrompt from "../../../ElevationPrompt";
import UpdateBanner from "../../../Updatebanner";
import UpdatePreviewModal from "../../../UpdatePreviewModal";
import {
  ExtendedSpeedDialog,
  ResetSettingsDialog,
  ResetUsageDialog,
  RestartAdminDialog,
} from "../settingsDialogs";
import { SettingsCard } from "./shared";
import "./DevToolsSection.css";

type PreviewId =
  | "reset-settings"
  | "reset-usage"
  | "extended-speed"
  | "restart-admin"
  | "elevation"
  | "update-banner"
  | "update-preview";

const TEST_MARKER = "!!test!!";

const PREVIEWS: { id: PreviewId; label: string; description: string }[] = [
  {
    id: "reset-settings",
    label: "Reset all settings",
    description: "Confirmation that wipes settings and presets.",
  },
  {
    id: "reset-usage",
    label: "Reset usage data",
    description: "Confirmation that deletes recorded sessions.",
  },
  {
    id: "extended-speed",
    label: "Extended click speed limit",
    description: "Confirmation before raising the speed limit to 1000.",
  },
  {
    id: "restart-admin",
    label: "Restart as administrator",
    description: "Confirmation that offers to relaunch elevated.",
  },
  {
    id: "elevation",
    label: "Administrator window prompt",
    description: "Blocking prompt shown when an elevated window takes focus.",
  },
  {
    id: "update-banner",
    label: "Update available banner",
    description: "Bar shown above the panels when a newer version exists.",
  },
  {
    id: "update-preview",
    label: "Update preview",
    description: "Changelog shown before an update is installed.",
  },
];

const SAMPLE_UPDATE: ChangelogEntry[] = [
  {
    version: "9.9.9",
    date: "1.1.2099",
    sections: [
      {
        heading: "New",
        items: [
          {
            text: "Sample feature added for the preview.",
            subitems: ["Sample sub-point for the preview."],
          },
        ],
      },
      {
        heading: "Fixed",
        items: [{ text: "Sample fix added for the preview.", subitems: [] }],
      },
    ],
  },
];

export default function DevToolsSection() {
  const [preview, setPreview] = useState<PreviewId | null>(null);
  const [promptToggle, setPromptToggle] = useState(false);
  const close = () => setPreview(null);

  useEffect(() => {
    if (preview !== "update-banner") return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [preview]);

  return (
    <>
      <SettingsCard
        title="Dev tools"
        description="Developer builds only. Each row opens a dialog in preview mode, so nothing is saved, deleted or restarted."
      >
        {PREVIEWS.map((entry) => (
          <div className="settings-row" key={entry.id}>
            <div className="settings-label-group">
              <span className="settings-label">{entry.label}</span>
              <span className="settings-sublabel">{entry.description}</span>
            </div>
            <button
              type="button"
              className="settings-btn-secondary"
              onClick={() => setPreview(entry.id)}
            >
              Open
            </button>
          </div>
        ))}
      </SettingsCard>

      <ResetSettingsDialog
        open={preview === "reset-settings"}
        testMarker={TEST_MARKER}
        onConfirm={close}
        onCancel={close}
      />

      <ResetUsageDialog
        open={preview === "reset-usage"}
        testMarker={TEST_MARKER}
        onConfirm={close}
        onCancel={close}
      />

      <ExtendedSpeedDialog
        open={preview === "extended-speed"}
        testMarker={TEST_MARKER}
        onConfirm={close}
        onCancel={close}
      />

      <RestartAdminDialog
        open={preview === "restart-admin"}
        testMarker={TEST_MARKER}
        onConfirm={close}
        onCancel={close}
      />

      <UpdatePreviewModal
        open={preview === "update-preview"}
        currentVersion="3.9.6"
        latestVersion="9.9.9"
        loading={false}
        error={false}
        entries={SAMPLE_UPDATE}
        testMarker={TEST_MARKER}
        onClose={close}
      />

      {preview === "update-banner"
        ? createPortal(
            <div
              className="dev-banner-layer"
              onClick={close}
              role="presentation"
            >
              <div
                className="dev-banner-bar"
                onClick={(event) => event.stopPropagation()}
              >
                <UpdateBanner
                  currentVersion="3.9.6"
                  latestVersion="9.9.9"
                  testMarker={TEST_MARKER}
                />
              </div>
            </div>,
            document.body,
          )
        : null}

      {preview === "elevation"
        ? createPortal(
            <div className="dev-elevation-preview">
              <ElevationPrompt
                open
                canElevate
                alwaysRunAsAdmin={promptToggle}
                windowName="Task Manager"
                windowTitle="Task Manager"
                busy={false}
                testMarker={TEST_MARKER}
                onRestart={close}
                onAlwaysRunChange={setPromptToggle}
                onDismiss={close}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
