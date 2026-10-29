import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import FirstRunSetup from "../components/FirstRunSetup";
import { createDefaultSettings } from "../settingsSchema";
import type { Settings } from "../settingsSchema";
import { playClickerSound } from "../soundPlayback";
import {
  installBrowserGlobals,
  setStoredSettings,
  tauri,
  windowCalls,
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

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => {}),
}));

vi.mock("../themeBridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../themeBridge")>();
  return {
    ...actual,
    onThemeApply: async () => () => {},
    emitThemeState: async () => {},
  };
});

vi.mock("../soundPlayback", () => ({
  playClickerSound: vi.fn(async () => {}),
  soundFileName: (path: string) => path,
}));

function setup(overrides: Partial<Settings> = {}) {
  const settings = { ...createDefaultSettings("0.0.0"), ...overrides };
  const update = vi.fn();
  const onFinish = vi.fn();
  render(
    <FirstRunSetup settings={settings} update={update} onFinish={onFinish} />,
  );
  return { settings, update, onFinish };
}

beforeEach(() => {
  tauri.reset();
  installBrowserGlobals();
  vi.mocked(playClickerSound).mockClear();
});

describe("FirstRunSetup", () => {
  it("starts on the sound step", () => {
    setup();

    expect(screen.getByRole("heading", { name: "Sounds" })).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("First-time setup")).toBeInTheDocument();
    expect(
      screen.getByText("Everything can be changed later in the settings."),
    ).toBeInTheDocument();
  });

  it("turns both sounds on and off with one switch", () => {
    const { update } = setup({
      enableSoundEnabled: true,
      disableSoundEnabled: true,
    });

    fireEvent.click(screen.getByRole("switch", { name: "Play sounds" }));

    expect(update).toHaveBeenCalledWith({
      enableSoundEnabled: false,
      disableSoundEnabled: false,
    });
  });

  it("reads off when only one of the two sounds is on", () => {
    const { update } = setup({
      enableSoundEnabled: true,
      disableSoundEnabled: false,
    });

    const toggle = screen.getByRole("switch", { name: "Play sounds" });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    expect(update).toHaveBeenCalledWith({
      enableSoundEnabled: true,
      disableSoundEnabled: true,
    });
  });

  it("previews a sound even while sounds are switched off", () => {
    setup({ enableSoundEnabled: false, disableSoundEnabled: false });

    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[0]);

    expect(playClickerSound).toHaveBeenCalledWith(
      "enable",
      expect.objectContaining({
        soundMuted: false,
        enableSoundEnabled: true,
        disableSoundEnabled: true,
      }),
    );
  });

  it("saves the volume of each sound separately", () => {
    const { update } = setup();

    fireEvent.change(
      screen.getByRole("slider", { name: "Clicking stops volume" }),
      {
        target: { value: "30" },
      },
    );

    expect(update).toHaveBeenCalledWith({ disableSoundVolume: 30 });
  });

  it("moves to the overlay step and finishes from there", () => {
    const { onFinish } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByRole("heading", { name: "Overlay" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("A small overlay in the top-right corner"),
    ).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("names the corner the overlay is set to", () => {
    setup({ indicatorCorner: "bottom-left" });

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByText("A small overlay in the bottom-left corner"),
    ).toBeInTheDocument();
  });

  it("walks back to the first step", () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("heading", { name: "Sounds" })).toBeInTheDocument();
  });

  it("skips from either step", () => {
    const { onFinish } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Skip setup" }));
    expect(onFinish).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip setup" }));
    expect(onFinish).toHaveBeenCalledTimes(2);
  });

  it("disables the overlay controls until the overlay is on", () => {
    setup({ indicatorEnabled: false });

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("slider", { name: "Overlay size" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
  });

  it("saves the overlay size", () => {
    const { update } = setup({ indicatorEnabled: true });

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByRole("slider", { name: "Overlay size" }), {
      target: { value: "64" },
    });

    expect(update).toHaveBeenCalledWith({ indicatorSize: 64 });
  });

  it("keeps a saved overlay size that is larger than the slider start", () => {
    setup({ indicatorEnabled: true, indicatorSize: 300 });

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    const slider = screen.getByRole("slider", { name: "Overlay size" });
    expect(slider).toHaveValue("300");
    expect(screen.getByText("300 px")).toBeInTheDocument();
  });

  it("turns the overlay on from the switch", () => {
    const { update } = setup({ indicatorEnabled: false });

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("switch", { name: "Show the overlay" }));

    expect(update).toHaveBeenCalledWith({ indicatorEnabled: true });
  });

  it("asks the backend to show the overlay", () => {
    setup({ indicatorEnabled: true });

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(tauri.invokes("preview_indicator")).toHaveLength(1);
  });
});

describe("first-time setup on launch", () => {
  async function renderApp() {
    render(<App />);
    await waitFor(
      () => expect(tauri.invokes("update_settings").length).toBeGreaterThan(0),
      { timeout: 5000 },
    );
  }

  it("replaces the panels for a fresh install", async () => {
    setStoredSettings({ onboardingCompleted: false });

    await renderApp();

    expect(
      await screen.findByRole("heading", { name: "Sounds" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Clicks Per")).not.toBeInTheDocument();
    expect(document.querySelector(".status-bar")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Simple" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("sizes the window for the setup and restores the panel size after", async () => {
    setStoredSettings({ onboardingCompleted: false });

    await renderApp();
    await screen.findByRole("heading", { name: "Sounds" });

    const sizes = () =>
      windowCalls("setSize").map(
        (call) => call.args[0] as { width: number; height: number },
      );

    expect(sizes()[0]).toMatchObject({ width: 620, height: 520 });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => {
      const last = sizes().at(-1);
      expect(last?.width).toBe(750);
    });
  });

  it("ignores the panel keybinds while setup is open", async () => {
    setStoredSettings({ onboardingCompleted: false });

    await renderApp();
    await screen.findByRole("heading", { name: "Sounds" });

    const before = tauri.invokes("update_settings").length;

    await act(async () => {
      fireEvent.keyDown(document.body, { key: "2", code: "Digit2" });
      await Promise.resolve();
    });

    expect(tauri.invokes("update_settings")).toHaveLength(before);
  });

  it("makes the window solid and hides the wallpaper", async () => {
    setStoredSettings({
      onboardingCompleted: false,
      windowOpacity: 40,
      panelOpacity: 40,
      backgroundOpacity: 80,
    });

    await renderApp();
    await screen.findByRole("heading", { name: "Sounds" });

    const root = document.querySelector(".app-root") as HTMLElement;
    expect(root.style.getPropertyValue("--bg-opacity")).toBe("0");
    expect(root.style.getPropertyValue("--panel-alpha")).toBe("1");
    expect(root.style.getPropertyValue("--bg-base")).toMatch(/, 1\)$/);
  });

  it("goes straight to the clicker once the flag is set", async () => {
    setStoredSettings({ onboardingCompleted: true });

    await renderApp();

    expect(await screen.findByLabelText("Clicks Per")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Sounds" }),
    ).not.toBeInTheDocument();
  });

  it("marks the setup done after finishing and shows the panels again", async () => {
    setStoredSettings({ onboardingCompleted: false });

    await renderApp();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => {
      const calls = tauri.invokes("update_settings");
      const last = calls[calls.length - 1];
      const settings = last?.args?.settings as Settings;
      expect(settings.onboardingCompleted).toBe(true);
    });

    expect(await screen.findByLabelText("Clicks Per")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Simple" }),
    ).toBeInTheDocument();
  });
});
