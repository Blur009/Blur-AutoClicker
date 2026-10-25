import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import type { Settings } from "../settingsSchema";
import {
  installBrowserGlobals,
  registerHotkeyEcho,
  tauri,
} from "./tauriHarness";

vi.mock(
  "@tauri-apps/api/core",
  async () => (await import("./tauriHarness")).coreModule,
);

vi.mock(
  "@tauri-apps/api/event",
  async () => (await import("./tauriHarness")).eventModule,
);

vi.mock(
  "@tauri-apps/api/window",
  async () => (await import("./tauriHarness")).windowModule,
);

vi.mock(
  "@tauri-apps/plugin-dialog",
  async () => (await import("./tauriHarness")).dialogModule,
);

vi.mock(
  "@tauri-apps/plugin-process",
  async () => (await import("./tauriHarness")).processModule,
);

vi.mock("../store", async () => (await import("./tauriHarness")).storeModule);

type Session = ReturnType<typeof userEvent.setup>;

function syncedSettings(): Settings {
  const calls = tauri.invokes("update_settings");
  const last = calls[calls.length - 1];
  return last?.args?.settings as Settings;
}

async function renderLoadedApp() {
  render(<App />);
  await waitFor(
    () => expect(tauri.invokes("update_settings").length).toBeGreaterThan(0),
    { timeout: 5000 },
  );
  await screen.findByLabelText("Clicks Per", undefined, { timeout: 5000 });
}

async function openMaintenanceTab(session: Session) {
  await session.click(await screen.findByRole("button", { name: "Settings" }));
  await session.click(
    await screen.findByRole(
      "button",
      {
        name: "Maintenance",
      },
      { timeout: 5000 },
    ),
  );
}

async function confirmResetSettings(session: Session) {
  const resetButtons = await screen.findAllByRole("button", { name: "Reset" });
  await session.click(resetButtons[0]!);
  const dialog = await screen.findByRole("dialog");
  await session.click(within(dialog).getByRole("button", { name: "Reset" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

beforeEach(() => {
  tauri.reset();
  installBrowserGlobals();
  tauri.setInvokeHandler("register_hotkey", registerHotkeyEcho);
});

describe("App boot", () => {
  it("hydrates the persisted click speed into the simple panel", async () => {
    tauri.setStoredSettings({ clickSpeed: 42 });

    await renderLoadedApp();

    expect(screen.getByLabelText("Clicks Per")).toHaveValue("42");
  });

  it("pushes the hydrated settings to the backend exactly once", async () => {
    tauri.setStoredSettings({ clickSpeed: 42 });

    await renderLoadedApp();

    const sync = tauri.invokes("update_settings");
    expect(sync).toHaveLength(1);
    expect(sync[0]!.args?.settings).toMatchObject({
      clickSpeed: 42,
      version: 11,
    });
  });

  it("emits frontend-ready before it starts loading backend state", async () => {
    await renderLoadedApp();

    expect(tauri.emits("frontend-ready").length).toBeGreaterThan(0);
    expect(tauri.firstIndexOf("emit", "frontend-ready")).toBeLessThan(
      tauri.firstIndexOf("invoke", "get_app_info"),
    );
  });

  it.each([
    { scale: 0, expectedZoom: 2 },
    { scale: Number.NaN, expectedZoom: 1 },
  ])(
    "keeps the webview zoom finite for a text scale of $scale",
    async ({ scale, expectedZoom }) => {
      tauri.setInvokeResult("get_text_scale_factor", scale);

      await renderLoadedApp();

      const factor = tauri.invokes("set_webview_zoom")[0]?.args?.factor;
      expect(factor).toBe(expectedZoom);
      expect(Number.isFinite(factor as number)).toBe(true);
    },
  );

  it("registers the persisted hotkey instead of the built-in default", async () => {
    tauri.setStoredSettings({ hotkey: "ctrl+shift+k" });

    await renderLoadedApp();

    expect(tauri.invokes("register_hotkey")[0]?.args).toEqual({
      hotkey: "ctrl+shift+k",
    });
  });

  it("still renders its panels when loading settings fails", async () => {
    tauri.failLoadSettings(new Error("settings store unreadable"));

    render(<App />);

    expect(await screen.findByLabelText("Clicks Per")).toHaveValue("25");
    await waitFor(() =>
      expect(tauri.windowCalls("setSize").length).toBeGreaterThan(0),
    );
    expect(screen.getByText("v0.0.0")).toBeInTheDocument();
  });

  it("keeps a settings recovery notice in the status bar after the boot sync", async () => {
    const notice =
      "Settings could not be read and were reset. Your old file is saved as C:/tmp/backup.json.";
    tauri.setRecoveryWarning(notice);

    await renderLoadedApp();

    await waitFor(() =>
      expect(document.querySelector(".status-bar")?.textContent).toContain(
        "Settings could not be read",
      ),
    );
    expect(tauri.invokes("set_settings_warning")[0]?.args).toEqual({
      warning: notice,
    });
    expect(
      tauri.firstIndexOf("invoke", "set_settings_warning"),
    ).toBeGreaterThan(tauri.firstIndexOf("invoke", "update_settings"));
  });
});

describe("App hotkey toggles", () => {
  it("fires a toggle hotkey once while the key is held", async () => {
    tauri.setStoredSettings({ keybindMode: "KeyQ" });

    await renderLoadedApp();
    const before = tauri.invokes("update_settings").length;

    await act(async () => {
      fireEvent.keyDown(document.body, { key: "q", code: "KeyQ" });
      fireEvent.keyDown(document.body, {
        key: "q",
        code: "KeyQ",
        repeat: true,
      });
      await Promise.resolve();
    });

    expect(tauri.invokes("update_settings")).toHaveLength(before + 1);
    expect(syncedSettings().mode).toBe("Hold");
  });
});

describe("App reset settings", () => {
  it("restores the three factory presets", async () => {
    await renderLoadedApp();
    const session = userEvent.setup();

    await openMaintenanceTab(session);
    await confirmResetSettings(session);

    await waitFor(() =>
      expect(syncedSettings().presets.map((preset) => preset.name)).toEqual([
        "Standard Clicking",
        "Rapid Fire",
        "Precision Mode",
      ]),
    );
    expect(syncedSettings().activePresetId).toBeNull();
  });

  it("restores the default click speed after the user changed it", async () => {
    await renderLoadedApp();
    const session = userEvent.setup();
    const speedInput = screen.getByLabelText("Clicks Per");
    await session.clear(speedInput);
    await session.type(speedInput, "42");
    expect(screen.getByLabelText("Clicks Per")).toHaveValue("42");

    await openMaintenanceTab(session);
    await confirmResetSettings(session);

    await waitFor(() =>
      expect(screen.getByLabelText("Clicks Per")).toHaveValue("25"),
    );
  });
});
