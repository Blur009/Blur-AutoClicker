import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPanel from "../components/panels/settings/SettingsPanel";
import { createDefaultSettings } from "../settingsSchema";
import { installBrowserGlobals, tauri } from "./tauriHarness";

vi.mock(
  "@tauri-apps/api/core",
  async () => (await import("./tauriHarness")).coreModule,
);

vi.mock(
  "@tauri-apps/plugin-process",
  async () => (await import("./tauriHarness")).processModule,
);

function renderPanel() {
  render(
    <SettingsPanel
      settings={createDefaultSettings("0.0.0")}
      update={() => {}}
      running={false}
      appInfo={{
        version: "0.0.0",
        updateStatus: "",
        screenshotProtectionSupported: false,
        portable: false,
      }}
      onSavePreset={() => false}
      onApplyPreset={() => false}
      onUpdatePreset={() => false}
      onRenamePreset={() => false}
      onDeletePreset={() => false}
      onDuplicatePreset={() => false}
      onExportPreset={async () => false}
      onImportPreset={async () => null}
      onToggleAlwaysOnTop={async () => {}}
      onRestartAsAdmin={async () => "refused"}
      onOpenCustomizer={() => {}}
      onReset={async () => {}}
      updateCheckStatus="idle"
      onCheckForUpdate={() => {}}
      onOpenFirstRunSetup={() => {}}
    />,
  );
}

beforeEach(() => {
  tauri.reset();
  installBrowserGlobals();
});

describe("dev tools settings tab", () => {
  it("is present in development builds and opens the preview list", async () => {
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Dev tools" }));
    expect(
      await screen.findByText(
        "Developer builds only. Each row opens a dialog in preview mode, so nothing is saved, deleted or restarted.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Reset all settings")).toBeInTheDocument();
  });
});
