import { useCallback, useState } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BehaviorSection from "../components/panels/settings/sections/BehaviorSection";
import { createDefaultSettings, type Settings } from "../settingsSchema";
import type { RestartOutcome } from "../restart";
import { tauri } from "./tauriHarness";

vi.mock(
  "@tauri-apps/api/core",
  async () => (await import("./tauriHarness")).coreModule,
);

vi.mock(
  "@tauri-apps/plugin-process",
  async () => (await import("./tauriHarness")).processModule,
);

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...createDefaultSettings("0.0.0"), ...overrides };
}

function toggleFor(label: string) {
  const row = screen.getByText(label).closest(".settings-row");
  if (!row) throw new Error(`no settings row for ${label}`);
  return within(row as HTMLElement).getByRole("button");
}

function SectionHarness({
  initial,
  updateSpy,
  onRestartAsAdmin,
  onRestartWithoutAdmin,
}: {
  initial: Partial<Settings>;
  updateSpy: (patch: Partial<Settings>) => void;
  onRestartAsAdmin: () => Promise<RestartOutcome>;
  onRestartWithoutAdmin: () => Promise<RestartOutcome>;
}) {
  const [settings, setSettings] = useState<Settings>(() =>
    makeSettings(initial),
  );
  const update = useCallback(
    (patch: Partial<Settings>) => {
      updateSpy(patch);
      setSettings((current) => ({ ...current, ...patch }));
    },
    [updateSpy],
  );
  return (
    <BehaviorSection
      settings={settings}
      update={update}
      onToggleAlwaysOnTop={async () => {}}
      onRestartAsAdmin={onRestartAsAdmin}
      onRestartWithoutAdmin={onRestartWithoutAdmin}
      portable={false}
    />
  );
}

function renderSection(
  overrides: Partial<Settings> = {},
  restart: () => Promise<RestartOutcome> = async () => "relaunched",
  restartStandard: () => Promise<RestartOutcome> = async () => "relaunched",
) {
  const update = vi.fn();
  const onRestartAsAdmin = vi.fn(restart);
  const onRestartWithoutAdmin = vi.fn(restartStandard);
  render(
    <SectionHarness
      initial={overrides}
      updateSpy={update}
      onRestartAsAdmin={onRestartAsAdmin}
      onRestartWithoutAdmin={onRestartWithoutAdmin}
    />,
  );
  return { update, onRestartAsAdmin, onRestartWithoutAdmin };
}

beforeEach(() => {
  tauri.reset();
});

describe("Run as Administrator toggle", () => {
  it("offers a restart when disabling while elevated", async () => {
    tauri.setInvokeResult("get_elevation_state", {
      elevated: true,
      canElevate: false,
    });
    const { update, onRestartWithoutAdmin } = renderSection({
      alwaysRunAsAdmin: true,
    });
    const user = userEvent.setup();
    await screen.findByText(
      "Running as administrator. Turn this off to restart without the rights.",
    );
    await user.click(toggleFor("Run as Administrator"));
    expect(update).toHaveBeenCalledWith({ alwaysRunAsAdmin: false });
    expect(
      await screen.findByText("Restart without administrator rights?"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restart now" }));
    await waitFor(() => expect(onRestartWithoutAdmin).toHaveBeenCalledTimes(1));
  });

  it("does not offer a restart when disabling and already unelevated", async () => {
    tauri.setInvokeResult("get_elevation_state", {
      elevated: false,
      canElevate: true,
    });
    const { update, onRestartWithoutAdmin } = renderSection({
      alwaysRunAsAdmin: true,
    });
    const user = userEvent.setup();
    await screen.findByText("Starts as administrator on the next launch.");
    await user.click(toggleFor("Run as Administrator"));
    expect(update).toHaveBeenCalledWith({ alwaysRunAsAdmin: false });
    await waitFor(() =>
      expect(
        screen.queryByText("Restart without administrator rights?"),
      ).toBeNull(),
    );
    expect(onRestartWithoutAdmin).not.toHaveBeenCalled();
  });

  it("keeps the dropped setting and explains a refused restart", async () => {
    tauri.setInvokeResult("get_elevation_state", {
      elevated: true,
      canElevate: false,
    });
    const { update } = renderSection(
      { alwaysRunAsAdmin: true },
      async () => "relaunched",
      async () => "refused",
    );
    const user = userEvent.setup();
    await screen.findByText(
      "Running as administrator. Turn this off to restart without the rights.",
    );
    await user.click(toggleFor("Run as Administrator"));
    await user.click(
      await screen.findByRole("button", { name: "Restart now" }),
    );
    expect(
      await screen.findByText(
        "Could not restart without administrator rights. Close and reopen the app to drop them.",
      ),
    ).toBeInTheDocument();
    expect(update).toHaveBeenCalledWith({ alwaysRunAsAdmin: false });
  });

  it("reports the live elevation state", async () => {
    tauri.setInvokeResult("get_elevation_state", {
      elevated: true,
      canElevate: false,
    });
    renderSection({ alwaysRunAsAdmin: true });
    expect(
      await screen.findByText(
        "Running as administrator. Turn this off to restart without the rights.",
      ),
    ).toBeInTheDocument();
  });

  it("says when the app is not elevated", async () => {
    tauri.setInvokeResult("get_elevation_state", {
      elevated: false,
      canElevate: true,
    });
    renderSection();
    expect(
      await screen.findByText("Not running as administrator."),
    ).toBeInTheDocument();
  });

  it("says when the setting will apply on the next launch", async () => {
    tauri.setInvokeResult("get_elevation_state", {
      elevated: false,
      canElevate: true,
    });
    renderSection({ alwaysRunAsAdmin: true });
    expect(
      await screen.findByText("Starts as administrator on the next launch."),
    ).toBeInTheDocument();
  });

  it("does not promise a next-launch elevation the account cannot do", async () => {
    tauri.setInvokeResult("get_elevation_state", {
      elevated: false,
      canElevate: false,
    });
    renderSection({ alwaysRunAsAdmin: true });
    expect(
      await screen.findByText(
        "This account cannot elevate automatically. Start it as administrator from Windows.",
      ),
    ).toBeInTheDocument();
  });

  it("stays disabled until the elevation state is known", async () => {
    let resolveState: (value: unknown) => void = () => {};
    tauri.setInvokeHandler(
      "get_elevation_state",
      () => new Promise((resolve) => (resolveState = resolve)),
    );
    const { update } = renderSection();
    await screen.findByText("Checking administrator status…");
    const toggle = toggleFor("Run as Administrator");
    expect(toggle).toBeDisabled();
    const user = userEvent.setup();
    await user.click(toggle);
    expect(update).not.toHaveBeenCalled();

    resolveState({ elevated: false, canElevate: true });
    await waitFor(() =>
      expect(toggleFor("Run as Administrator")).toBeEnabled(),
    );
  });

  it("recovers from a failed elevation state fetch", async () => {
    tauri.setInvokeHandler("get_elevation_state", () => {
      throw new Error("ipc down");
    });
    const { update } = renderSection();
    expect(
      await screen.findByText(
        "Could not read administrator status. The setting still applies on the next launch.",
      ),
    ).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(toggleFor("Run as Administrator"));
    expect(update).toHaveBeenCalledWith({ alwaysRunAsAdmin: true });
  });

  it("offers a restart when enabling on a non-elevated elevatable app", async () => {
    tauri.setInvokeResult("get_elevation_state", {
      elevated: false,
      canElevate: true,
    });
    const { update } = renderSection();
    const user = userEvent.setup();
    await screen.findByText("Not running as administrator.");
    await user.click(toggleFor("Run as Administrator"));
    expect(update).toHaveBeenCalledWith({ alwaysRunAsAdmin: true });
    expect(
      await screen.findByText("Restart as administrator?"),
    ).toBeInTheDocument();
  });

  it("keeps the setting and skips the relaunch when dismissed", async () => {
    tauri.setInvokeResult("get_elevation_state", {
      elevated: false,
      canElevate: true,
    });
    const { update, onRestartAsAdmin } = renderSection();
    const user = userEvent.setup();
    await screen.findByText("Not running as administrator.");
    await user.click(toggleFor("Run as Administrator"));
    await user.click(await screen.findByRole("button", { name: "Not now" }));
    await waitFor(() =>
      expect(screen.queryByText("Restart as administrator?")).toBeNull(),
    );
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ alwaysRunAsAdmin: true });
    expect(onRestartAsAdmin).not.toHaveBeenCalled();
    expect(
      screen.getByText("Starts as administrator on the next launch."),
    ).toBeInTheDocument();
  });

  it("asks the app to relaunch when confirmed", async () => {
    tauri.setInvokeResult("get_elevation_state", {
      elevated: false,
      canElevate: true,
    });
    const { onRestartAsAdmin } = renderSection();
    const user = userEvent.setup();
    await screen.findByText("Not running as administrator.");
    await user.click(toggleFor("Run as Administrator"));
    await user.click(
      await screen.findByRole("button", { name: "Restart now" }),
    );
    await waitFor(() => expect(onRestartAsAdmin).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByText("Restart as administrator?")).toBeNull(),
    );
  });

  it("keeps running and explains when the relaunch is refused", async () => {
    tauri.setInvokeResult("get_elevation_state", {
      elevated: false,
      canElevate: true,
    });
    renderSection({}, async () => "refused");
    const user = userEvent.setup();
    await screen.findByText("Not running as administrator.");
    await user.click(toggleFor("Run as Administrator"));
    await user.click(
      await screen.findByRole("button", { name: "Restart now" }),
    );
    expect(
      await screen.findByText(
        "Could not restart. It starts as administrator on the next launch.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Restart as administrator?")).toBeNull();
  });

  it("keeps running and explains when the relaunch throws", async () => {
    tauri.setInvokeResult("get_elevation_state", {
      elevated: false,
      canElevate: true,
    });
    renderSection({}, async () => {
      throw new Error("nope");
    });
    const user = userEvent.setup();
    await screen.findByText("Not running as administrator.");
    await user.click(toggleFor("Run as Administrator"));
    await user.click(
      await screen.findByRole("button", { name: "Restart now" }),
    );
    expect(
      await screen.findByText(
        "Could not restart. It starts as administrator on the next launch.",
      ),
    ).toBeInTheDocument();
  });

  it("cannot be relaunched twice while a restart is in flight", async () => {
    tauri.setInvokeResult("get_elevation_state", {
      elevated: false,
      canElevate: true,
    });
    let finish: (value: RestartOutcome) => void = () => {};
    const restart = () =>
      new Promise<RestartOutcome>((resolve) => {
        finish = resolve;
      });
    const { onRestartAsAdmin } = renderSection({}, restart);
    const user = userEvent.setup();
    await screen.findByText("Not running as administrator.");
    await user.click(toggleFor("Run as Administrator"));
    await user.click(
      await screen.findByRole("button", { name: "Restart now" }),
    );
    const busy = await screen.findByRole("button", { name: "Working..." });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(onRestartAsAdmin).toHaveBeenCalledTimes(1);

    finish("refused");
    expect(
      await screen.findByText(
        "Could not restart. It starts as administrator on the next launch.",
      ),
    ).toBeInTheDocument();
  });

  it("reports a settings save failure instead of pretending it saved", async () => {
    tauri.setInvokeResult("get_elevation_state", {
      elevated: false,
      canElevate: true,
    });
    renderSection({}, async () => "unsaved");
    const user = userEvent.setup();
    await screen.findByText("Not running as administrator.");
    await user.click(toggleFor("Run as Administrator"));
    await user.click(
      await screen.findByRole("button", { name: "Restart now" }),
    );
    expect(
      await screen.findByText(
        "Could not save the setting. Nothing was restarted, so the next launch stays unelevated.",
      ),
    ).toBeInTheDocument();
  });

  it("clears a stale restart failure on the next toggle", async () => {
    tauri.setInvokeResult("get_elevation_state", {
      elevated: false,
      canElevate: true,
    });
    const { update } = renderSection({}, async () => "refused");
    const user = userEvent.setup();
    await screen.findByText("Not running as administrator.");
    await user.click(toggleFor("Run as Administrator"));
    await user.click(
      await screen.findByRole("button", { name: "Restart now" }),
    );
    await screen.findByText(
      "Could not restart. It starts as administrator on the next launch.",
    );
    await user.click(toggleFor("Run as Administrator"));
    expect(update).toHaveBeenLastCalledWith({ alwaysRunAsAdmin: false });
    expect(
      await screen.findByText("Not running as administrator."),
    ).toBeInTheDocument();
  });

  it("tells an elevated user with the setting on how to drop the rights", async () => {
    tauri.setInvokeResult("get_elevation_state", {
      elevated: true,
      canElevate: false,
    });
    renderSection({ alwaysRunAsAdmin: true });
    expect(
      await screen.findByText(
        "Running as administrator. Turn this off to restart without the rights.",
      ),
    ).toBeInTheDocument();
  });

  it("asks nothing when the app is already elevated but still saves", async () => {
    tauri.setInvokeResult("get_elevation_state", {
      elevated: true,
      canElevate: false,
    });
    const { update } = renderSection({ alwaysRunAsAdmin: false });
    const user = userEvent.setup();
    await screen.findByText(
      "Running as administrator now. Close the app to drop the rights.",
    );
    await user.click(toggleFor("Run as Administrator"));
    expect(update).toHaveBeenCalledWith({ alwaysRunAsAdmin: true });
    expect(screen.queryByText("Restart as administrator?")).toBeNull();
  });

  it("asks nothing when the account cannot elevate", async () => {
    tauri.setInvokeResult("get_elevation_state", {
      elevated: false,
      canElevate: false,
    });
    const { update } = renderSection();
    const user = userEvent.setup();
    await screen.findByText("Not running as administrator.");
    await user.click(toggleFor("Run as Administrator"));
    expect(update).toHaveBeenCalledWith({ alwaysRunAsAdmin: true });
    expect(screen.queryByText("Restart as administrator?")).toBeNull();
  });

  it("disables without a dialog while elevated", async () => {
    tauri.setInvokeResult("get_elevation_state", {
      elevated: true,
      canElevate: false,
    });
    const { update, onRestartAsAdmin } = renderSection({
      alwaysRunAsAdmin: true,
    });
    const user = userEvent.setup();
    await screen.findByText(
      "Running as administrator. Turn this off to restart without the rights.",
    );
    await user.click(toggleFor("Run as Administrator"));
    expect(update).toHaveBeenCalledWith({ alwaysRunAsAdmin: false });
    expect(screen.queryByText("Restart as administrator?")).toBeNull();
    expect(onRestartAsAdmin).not.toHaveBeenCalled();
  });

  it("saves the administrator window notice toggle", async () => {
    tauri.setInvokeResult("get_elevation_state", {
      elevated: false,
      canElevate: true,
    });
    const { update } = renderSection({ elevationNoticeEnabled: true });
    const user = userEvent.setup();
    await screen.findByText("Not running as administrator.");
    await user.click(toggleFor("Administrator Window Notice"));
    expect(update).toHaveBeenCalledWith({ elevationNoticeEnabled: false });
  });
});
