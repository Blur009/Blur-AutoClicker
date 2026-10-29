import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
const savedSettings = { value: undefined as unknown };

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(async () => "1.2.3"),
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    async get() {
      return savedSettings.value;
    }
    async set() {}
    async save() {}
  },
}));

function respondToCommands(commands: Record<string, unknown>) {
  invokeMock.mockImplementation((command: string) => {
    if (!(command in commands)) {
      return Promise.reject(new Error(`unexpected command ${command}`));
    }
    return Promise.resolve(commands[command]);
  });
}

describe("settings recovery notice", () => {
  beforeEach(() => {
    vi.resetModules();
    invokeMock.mockReset();
    savedSettings.value = undefined;
  });

  it("exposes the backup path after loadSettings backs the file up", async () => {
    respondToCommands({
      get_portable_info: { portable: false, dataDir: null },
      backup_unreadable_settings:
        "C:/data/settings.recovered-20240101-120000.json",
      set_settings_warning: null,
    });

    const store = await import("../store");
    await store.loadSettings();

    expect(store.settingsRecoveryWarning()).toBe(
      "Settings could not be read and were reset. Your old file is saved as C:/data/settings.recovered-20240101-120000.json.",
    );
  });

  it("reports no notice when the settings file is readable", async () => {
    savedSettings.value = { clickSpeed: 12 };
    respondToCommands({
      get_portable_info: { portable: false, dataDir: null },
      backup_unreadable_settings: null,
    });

    const store = await import("../store");
    await store.loadSettings();

    expect(store.settingsRecoveryWarning()).toBeNull();
  });

  it("keeps the notice available after the boot sync clears the backend warning", async () => {
    respondToCommands({
      get_portable_info: { portable: false, dataDir: null },
      backup_unreadable_settings:
        "C:/data/settings.recovered-20240101-120000.json",
      set_settings_warning: null,
      update_settings: null,
    });

    const store = await import("../store");
    await store.loadSettings();
    await invokeMock("update_settings", { settings: {} });

    expect(store.settingsRecoveryWarning()).toContain(
      "settings.recovered-20240101-120000.json",
    );
  });
});
