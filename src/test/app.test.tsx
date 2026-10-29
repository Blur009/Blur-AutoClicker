import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { MockInstance } from "vitest";
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
import { createThemeProfile } from "../themeModel";
import type { ThemeApplyMessage, ThemeStateMessage } from "../themeBridge";
import {
  installBrowserGlobals,
  registerHotkeyEcho,
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

const openerMock = vi.hoisted(() => ({ openUrl: vi.fn(async () => {}) }));

vi.mock("@tauri-apps/plugin-opener", () => openerMock);

const themeBridgeMock = vi.hoisted(() => ({
  apply: null as ((message: ThemeApplyMessage) => void) | null,
  states: [] as ThemeStateMessage[],
}));

vi.mock("../themeBridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../themeBridge")>();
  return {
    ...actual,
    onThemeApply: (handler: (message: ThemeApplyMessage) => void) => {
      themeBridgeMock.apply = handler;
      return Promise.resolve(() => {});
    },
    emitThemeState: async (message: ThemeStateMessage) => {
      themeBridgeMock.states.push(message);
    },
  };
});

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
  themeBridgeMock.apply = null;
  themeBridgeMock.states.length = 0;
  openerMock.openUrl.mockClear();
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

  it("relaunches as administrator only after the window is shown", async () => {
    tauri.setStoredSettings({ alwaysRunAsAdmin: true });
    tauri.setInvokeResult("get_elevation_state", {
      elevated: false,
      canElevate: true,
    });
    tauri.setInvokeResult("relaunch_as_admin", false);

    await renderLoadedApp();

    await waitFor(
      () => expect(tauri.invokes("relaunch_as_admin")).toHaveLength(1),
      { timeout: 5000 },
    );
    expect(tauri.invokes("relaunch_as_admin")[0]!.args).toEqual({
      keepAutostart: true,
    });
    const shown = tauri.firstIndexOf("window", "show");
    expect(shown).toBeGreaterThan(-1);
    expect(shown).toBeLessThan(
      tauri.firstIndexOf("invoke", "relaunch_as_admin"),
    );
  });

  it("does not relaunch when it is already elevated", async () => {
    tauri.setStoredSettings({ alwaysRunAsAdmin: true });
    tauri.setInvokeResult("get_elevation_state", {
      elevated: true,
      canElevate: false,
    });

    await renderLoadedApp();

    expect(tauri.invokes("relaunch_as_admin")).toHaveLength(0);
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

function customThemeProfile() {
  const profile = createThemeProfile(
    "dark",
    "#22c55e",
    "Custom 1",
    "theme-1",
    1,
  );
  profile.tokens.bgSurface = { hex: "#123456", alpha: 1 };
  return profile;
}

async function openAppearanceTab(session: Session) {
  await session.click(await screen.findByRole("button", { name: "Settings" }));
  await session.click(
    await screen.findByRole(
      "button",
      { name: "Appearance" },
      { timeout: 5000 },
    ),
  );
}

describe("App custom themes", () => {
  it("writes custom theme tokens to the document element", async () => {
    tauri.setStoredSettings({
      theme: "custom",
      themeProfiles: [customThemeProfile()],
      activeThemeProfileId: "theme-1",
    });

    await renderLoadedApp();

    await waitFor(() =>
      expect(
        document.documentElement.style.getPropertyValue("--bg-surface-solid"),
      ).toBe("rgb(18, 52, 86)"),
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    const appRoot = document.querySelector(".app-root") as HTMLElement | null;
    expect(appRoot?.style.getPropertyValue("--bg-surface-solid")).toBe("");
  });

  it("clears custom tokens and restores the dark dataset when switching to dark", async () => {
    const profile = createThemeProfile(
      "light",
      "#22c55e",
      "Custom 1",
      "theme-1",
      1,
    );
    profile.tokens.bgSurface = { hex: "#123456", alpha: 1 };
    tauri.setStoredSettings({
      theme: "custom",
      themeProfiles: [profile],
      activeThemeProfileId: "theme-1",
    });

    await renderLoadedApp();

    await waitFor(() =>
      expect(
        document.documentElement.style.getPropertyValue("--bg-surface-solid"),
      ).toBe("rgb(18, 52, 86)"),
    );
    expect(document.documentElement.dataset.theme).toBe("light");

    const session = userEvent.setup();
    await openAppearanceTab(session);
    const themeGroup = document.querySelector<HTMLElement>(
      ".settings-seg-group--theme",
    )!;
    await session.click(
      within(themeGroup).getByRole("button", { name: "Dark" }),
    );

    await waitFor(() =>
      expect(
        document.documentElement.style.getPropertyValue("--bg-surface-solid"),
      ).toBe(""),
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("sends the custom profile accent and base to the desktop accent", async () => {
    const profile = createThemeProfile(
      "light",
      "#abcdef",
      "Custom 1",
      "theme-1",
      1,
    );
    tauri.setStoredSettings({
      theme: "custom",
      themeProfiles: [profile],
      activeThemeProfileId: "theme-1",
    });

    await renderLoadedApp();

    await waitFor(() => {
      const calls = tauri.invokes("set_accent_color");
      const last = calls[calls.length - 1];
      expect(last?.args?.color).toBe("#abcdef");
      expect(last?.args?.theme).toBe("light");
    });
  });

  it("persists a theme apply message and answers with the new state", async () => {
    await renderLoadedApp();
    const session = userEvent.setup();
    await waitFor(() => expect(themeBridgeMock.apply).not.toBeNull());

    const incoming = createThemeProfile(
      "light",
      "#ff0000",
      "Incoming",
      "theme-new",
      2,
    );

    await act(async () => {
      themeBridgeMock.apply!({
        kind: "upsert",
        sessionId: "session-1",
        seq: 1,
        profile: incoming,
        activateCustom: true,
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      const state = themeBridgeMock.states.at(-1);
      expect(state?.sessionId).toBe("session-1");
      expect(state?.ackSeq).toBe(1);
      expect(state?.theme).toBe("custom");
      expect(state?.activeProfileId).toBe("theme-new");
      expect(state?.profiles.map((entry) => entry.id)).toEqual(["theme-new"]);
      expect(state?.activeProfile?.id).toBe("theme-new");
    });

    await act(async () => {
      themeBridgeMock.apply!({
        kind: "upsert",
        sessionId: "session-1",
        seq: 1,
        profile: createThemeProfile(
          "dark",
          "#000000",
          "Stale",
          "theme-stale",
          3,
        ),
        activateCustom: true,
      });
      await Promise.resolve();
    });

    expect(
      themeBridgeMock.states.at(-1)?.profiles.map((entry) => entry.id),
    ).toEqual(["theme-new"]);

    const speedInput = screen.getByLabelText("Clicks Per");
    await session.clear(speedInput);
    await session.type(speedInput, "30");

    await waitFor(() => expect(syncedSettings().clickSpeed).toBe(30));
    expect(syncedSettings().theme).toBe("custom");
    await waitFor(() => {
      const saved = tauri.savedSettings().at(-1);
      expect(saved?.themeProfiles.map((profile) => profile.id)).toEqual([
        "theme-new",
      ]);
      expect(saved?.activeThemeProfileId).toBe("theme-new");
      expect(saved?.clickSpeed).toBe(30);
    });

    await act(async () => {
      themeBridgeMock.apply!({
        kind: "delete",
        sessionId: "session-1",
        seq: 2,
        profileId: "theme-new",
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      const state = themeBridgeMock.states.at(-1);
      expect(state?.theme).toBe("dark");
      expect(state?.activeProfileId).toBe("");
      expect(state?.profiles).toEqual([]);
    });
    await waitFor(() => {
      const saved = tauri.savedSettings().at(-1);
      expect(saved?.themeProfiles).toEqual([]);
      expect(saved?.activeThemeProfileId).toBe("");
    });
  });

  it("disables the accent controls while a custom theme is active", async () => {
    tauri.setStoredSettings({
      theme: "custom",
      themeProfiles: [customThemeProfile()],
      activeThemeProfileId: "theme-1",
    });

    await renderLoadedApp();
    const session = userEvent.setup();
    await openAppearanceTab(session);

    expect(
      await screen.findByText("Part of the custom theme you are using."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit custom theme" }),
    ).toBeInTheDocument();
    expect(
      document.querySelector(".settings-color-controls[aria-disabled='true']"),
    ).not.toBeNull();
  });

  it("selects the last custom theme without opening the customizer", async () => {
    tauri.setStoredSettings({
      theme: "dark",
      themeProfiles: [customThemeProfile()],
      activeThemeProfileId: "theme-1",
    });

    await renderLoadedApp();
    const session = userEvent.setup();
    await openAppearanceTab(session);

    await session.click(await screen.findByRole("button", { name: "Custom" }));

    expect(
      await screen.findByRole("button", { name: "Edit custom theme" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Custom" })).toHaveClass(
      "active",
    );
    expect(tauri.invokes("open_theme_window")).toHaveLength(0);

    await session.click(
      screen.getByRole("button", { name: "Edit custom theme" }),
    );

    await waitFor(() =>
      expect(tauri.invokes("open_theme_window")).toHaveLength(1),
    );
  });

  it("opens the theme window from the Custom segment when no profiles exist", async () => {
    await renderLoadedApp();
    const session = userEvent.setup();

    await openAppearanceTab(session);
    const syncedBefore = tauri.invokes("update_settings").length;

    await session.click(await screen.findByRole("button", { name: "Custom" }));

    await waitFor(() =>
      expect(tauri.invokes("open_theme_window")).toHaveLength(1),
    );
    expect(tauri.invokes("update_settings")).toHaveLength(syncedBefore);
    expect(syncedSettings().theme).toBe("dark");
  });

  it("opens the theme window with Ctrl+Alt+T", async () => {
    await renderLoadedApp();

    await act(async () => {
      fireEvent.keyDown(document.body, {
        key: "t",
        code: "KeyT",
        ctrlKey: true,
        altKey: true,
      });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(tauri.invokes("open_theme_window")).toHaveLength(1),
    );
  });
});

describe("App status bar sounds", () => {
  it("shows the speaker icon by default", async () => {
    await renderLoadedApp();
    await waitFor(() =>
      expect(document.querySelector(".status-bar-sound-btn")).not.toBeNull(),
    );
  });

  it("hides the icon when both sounds are turned off", async () => {
    tauri.setStoredSettings({
      enableSoundEnabled: false,
      disableSoundEnabled: false,
    });

    await renderLoadedApp();
    await waitFor(() =>
      expect(document.querySelector(".status-bar")).not.toBeNull(),
    );
    expect(document.querySelector(".status-bar-sound-btn")).toBeNull();
  });

  it("hides the icon when the status bar sound toggle is off", async () => {
    tauri.setStoredSettings({
      enableSoundEnabled: true,
      statusBarSoundEnabled: false,
    });

    await renderLoadedApp();
    await waitFor(() =>
      expect(document.querySelector(".status-bar")).not.toBeNull(),
    );
    expect(document.querySelector(".status-bar-sound-btn")).toBeNull();
  });

  it("opens the Sounds settings tab on right click", async () => {
    tauri.setStoredSettings({ enableSoundEnabled: true });

    await renderLoadedApp();
    const icon = await screen.findByLabelText(/Sounds on/);

    fireEvent.contextMenu(icon);

    expect(
      await screen.findByText("Auto clicker enabled", undefined, {
        timeout: 5000,
      }),
    ).toBeInTheDocument();
  });

  it("mutes every sound from the speaker icon", async () => {
    tauri.setStoredSettings({ enableSoundEnabled: true });

    await renderLoadedApp();
    const icon = await screen.findByLabelText(/Sounds on/);

    fireEvent.click(icon);

    await waitFor(() => expect(syncedSettings().soundMuted).toBe(true));
    expect(await screen.findByLabelText(/Sounds muted/)).toBeInTheDocument();
  });

  it("hides the preset name when the status bar preset toggle is off", async () => {
    tauri.setStoredSettings({ statusBarPresetEnabled: false });

    await renderLoadedApp();
    await waitFor(() =>
      expect(document.querySelector(".status-bar")).not.toBeNull(),
    );
    expect(document.querySelector(".status-bar-preset-btn")).toBeNull();
    expect(document.querySelector(".status-bar-hint-btn")).toBeNull();
  });

  it("shows the preset hint by default", async () => {
    await renderLoadedApp();
    await waitFor(() =>
      expect(document.querySelector(".status-bar-hint-btn")).not.toBeNull(),
    );
  });
});

describe("App maintenance page", () => {
  it("opens the Discord invite from the General tab", async () => {
    await renderLoadedApp();
    const session = userEvent.setup();
    await session.click(
      await screen.findByRole("button", { name: "Settings" }),
    );

    await session.click(await screen.findByTitle("Discord"));

    await waitFor(() =>
      expect(openerMock.openUrl).toHaveBeenCalledWith(
        "https://discord.gg/jhWEW747x5",
      ),
    );
  });

  it("opens the Discord invite from the banner", async () => {
    await renderLoadedApp();
    const session = userEvent.setup();
    await openMaintenanceTab(session);

    const banner = await screen.findByRole("button", {
      name: /Join the Discord/i,
    });
    await session.click(banner);

    await waitFor(() =>
      expect(openerMock.openUrl).toHaveBeenCalledWith(
        "https://discord.gg/jhWEW747x5",
      ),
    );
  });
});

const STATUS_EVENT = "clicker-status";

function statusPayload(running: boolean) {
  return {
    running,
    paused: false,
    clickCount: running ? 3 : 0,
    lastError: null,
    stopReason: null,
    warning: null,
    activeClickPointIndex: null,
    activeClickPointTick: 0,
    masterAllowed: true,
    elevationBlocked: false,
    elevationBlockedWindow: null,
  };
}

describe("App clicker sounds", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubAudioPlay() {
    return vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(() => Promise.resolve());
  }

  function playedSrc(play: MockInstance, index: number) {
    const element = play.mock.instances[index] as HTMLMediaElement | undefined;
    return element?.src ?? "";
  }

  async function emitStatus(running: boolean) {
    await act(async () => {
      tauri.emitBackendEvent(STATUS_EVENT, statusPayload(running));
      await Promise.resolve();
    });
  }

  it("plays once on start and once on stop", async () => {
    const play = stubAudioPlay();
    await renderLoadedApp();

    await emitStatus(true);
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(playedSrc(play, 0)).toContain("/sounds/enable.wav");

    await emitStatus(false);
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
    expect(playedSrc(play, 1)).toContain("/sounds/disable.wav");
  });

  it("plays nothing for repeated status updates without a transition", async () => {
    const play = stubAudioPlay();
    await renderLoadedApp();

    await emitStatus(false);
    await emitStatus(true);
    await emitStatus(true);

    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
  });

  it("keeps quiet while muted", async () => {
    tauri.setStoredSettings({ soundMuted: true });
    const play = stubAudioPlay();
    await renderLoadedApp();

    await emitStatus(true);
    await emitStatus(false);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(play).not.toHaveBeenCalled();
  });

  it("respects the per-sound toggles", async () => {
    tauri.setStoredSettings({
      enableSoundEnabled: true,
      disableSoundEnabled: false,
    });
    const play = stubAudioPlay();
    await renderLoadedApp();

    await emitStatus(true);
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));

    await emitStatus(false);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("authorizes a local background image through allow_local_media", async () => {
    const path = String.raw`C:\wallpapers\bg.png`;
    tauri.setStoredSettings({ backgroundImage: path });

    await renderLoadedApp();

    await waitFor(() => {
      const call = tauri
        .invokes("allow_local_media")
        .find((record) => record.args?.path === path);
      expect(call).toBeTruthy();
    });
  });
});

describe("App interface scale", () => {
  afterEach(() => {
    document.documentElement.style.fontSize = "";
  });

  it("scales through page zoom so px and icons grow too", async () => {
    tauri.setStoredSettings({ uiScale: 150 });

    await renderLoadedApp();

    await waitFor(() =>
      expect(tauri.invokes("set_webview_zoom").length).toBeGreaterThan(0),
    );
    expect(tauri.invokes("set_webview_zoom").at(-1)?.args?.factor).toBe(1.5);
    expect(document.documentElement.style.fontSize).toBe("16px");

    const root = document.querySelector(".app-root") as HTMLElement;
    await waitFor(() => expect(root.style.width).toBe("750px"));
    expect(Number.parseFloat(root.style.height)).toBeCloseTo(201.33, 2);

    const first = windowCalls("setSize")[0]?.args[0] as {
      width: number;
      height: number;
    };
    expect(first.width).toBe(1125);
    expect(first.height).toBe(302);
  });

  it("composes the ui scale with the windows text scale", async () => {
    tauri.setStoredSettings({ uiScale: 150 });
    tauri.setInvokeResult("get_text_scale_factor", 1.25);

    await renderLoadedApp();

    await waitFor(() =>
      expect(tauri.invokes("set_webview_zoom").at(-1)?.args?.factor).toBe(1.2),
    );
    expect(document.documentElement.style.fontSize).toBe("20px");

    const first = windowCalls("setSize")[0]?.args[0] as {
      width: number;
      height: number;
    };
    expect(first.width).toBe(1407);
  });

  it("keeps the plain size and zoom at 100 percent", async () => {
    await renderLoadedApp();

    await waitFor(() =>
      expect(document.documentElement.style.fontSize).toBe("16px"),
    );
    expect(tauri.invokes("set_webview_zoom").at(-1)?.args?.factor).toBe(1);

    const first = windowCalls("setSize")[0]?.args[0] as {
      width: number;
      height: number;
    };
    expect(first.width).toBe(750);
    expect(first.height).toBe(201);
  });

  it("steps by 10, 25 and 50 percent from the status bar", async () => {
    await renderLoadedApp();
    const plus = await screen.findByLabelText("Increase interface scale");

    fireEvent.click(plus);
    await waitFor(() => expect(syncedSettings().uiScale).toBe(110));

    fireEvent.click(plus, { shiftKey: true });
    await waitFor(() => expect(syncedSettings().uiScale).toBe(135));

    fireEvent.click(plus, { ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(syncedSettings().uiScale).toBe(185));
  });

  it("steps down from the status bar", async () => {
    await renderLoadedApp();
    const minus = await screen.findByLabelText("Decrease interface scale");

    fireEvent.click(minus, { shiftKey: true });

    await waitFor(() => expect(syncedSettings().uiScale).toBe(75));
  });

  it("resets to 100 percent when the number is clicked", async () => {
    tauri.setStoredSettings({ uiScale: 175 });

    await renderLoadedApp();
    fireEvent.click(await screen.findByLabelText(/Interface scale 175%/));

    await waitFor(() => expect(syncedSettings().uiScale).toBe(100));
  });

  it("disables the buttons at the bounds", async () => {
    tauri.setStoredSettings({ uiScale: 300 });

    await renderLoadedApp();

    expect(
      await screen.findByLabelText("Increase interface scale"),
    ).toBeDisabled();
  });
});

describe("App status bar scale toggle", () => {
  afterEach(() => {
    document.documentElement.style.fontSize = "";
  });

  it("hides the scale control when the toggle is off", async () => {
    tauri.setStoredSettings({ statusBarScaleEnabled: false });

    await renderLoadedApp();
    await waitFor(() =>
      expect(document.querySelector(".status-bar")).not.toBeNull(),
    );

    expect(document.querySelector(".ui-scale")).toBeNull();
  });

  it("shows the scale control by default", async () => {
    await renderLoadedApp();

    expect(
      await screen.findByLabelText("Increase interface scale"),
    ).toBeInTheDocument();
  });
});

describe("App donation reminder", () => {
  const heavyStats = {
    totalClicks: 1_200_000,
    totalTimeSecs: 0,
    totalSessions: 4,
    avgCpu: 0,
  };

  async function renderUntilStats() {
    render(<App />);
    await waitFor(
      () => expect(tauri.invokes("update_settings").length).toBeGreaterThan(0),
      { timeout: 5000 },
    );
  }

  it("opens on a heavy milestone and moves off the simple tab", async () => {
    tauri.setInvokeResult("get_stats", heavyStats);

    await renderUntilStats();

    const dialog = await screen.findByRole("dialog", {
      name: /You've reached 1 million clicks/,
    });
    expect(
      within(dialog).getByText(/^One person builds BlurAutoClicker\./),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("1,200,000 clicks recorded so far"),
    ).toBeInTheDocument();
    expect(document.querySelector(".app-root")?.getAttribute("data-tab")).toBe(
      "advanced",
    );
  });

  it("stays quiet when the milestone was already acknowledged", async () => {
    tauri.setInvokeResult("get_stats", heavyStats);
    tauri.setStoredSettings({ donationClicksMilestone: 1_000_000 });

    await renderUntilStats();
    await waitFor(() => expect(tauri.invokes("get_stats")).not.toHaveLength(0));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays quiet for a light history", async () => {
    tauri.setInvokeResult("get_stats", {
      ...heavyStats,
      totalClicks: 900_000,
    });

    await renderUntilStats();
    await waitFor(() => expect(tauri.invokes("get_stats")).not.toHaveLength(0));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("remembers a decline", async () => {
    tauri.setInvokeResult("get_stats", heavyStats);

    await renderUntilStats();
    const dialog = await screen.findByRole("dialog", {
      name: /You've reached 1 million clicks/,
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "No, Thank you" }),
    );

    expect(
      await screen.findByText("Enjoy the autoclicker."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(syncedSettings().donationClicksMilestone).toBe(1_000_000),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {
      timeout: 4000,
    });
  });

  it("opens ko-fi from the support button and remembers it", async () => {
    tauri.setInvokeResult("get_stats", heavyStats);

    await renderUntilStats();
    const dialog = await screen.findByRole("dialog", {
      name: /You've reached 1 million clicks/,
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Support Me" }));

    expect(openerMock.openUrl).toHaveBeenCalledWith(
      "https://ko-fi.com/Z8Z71T8QD4",
    );
    expect(await screen.findByText("Thank you.")).toBeInTheDocument();
    await waitFor(() =>
      expect(syncedSettings().donationClicksMilestone).toBe(1_000_000),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {
      timeout: 4000,
    });
  });
});
