import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check } from "@tauri-apps/plugin-updater";
import DevToolsSection from "../components/panels/settings/sections/DevToolsSection";
import { tauri } from "./tauriHarness";

vi.mock(
  "@tauri-apps/api/core",
  async () => (await import("./tauriHarness")).coreModule,
);

vi.mock(
  "@tauri-apps/plugin-process",
  async () => (await import("./tauriHarness")).processModule,
);

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => {}),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(async () => null),
}));

function openRow(label: string) {
  const row = screen.getByText(label).closest(".settings-row");
  if (!row) throw new Error(`no row for ${label}`);
  return within(row as HTMLElement).getByRole("button", { name: "Open" });
}

beforeEach(() => {
  tauri.reset();
  vi.mocked(check).mockClear();
  vi.mocked(openUrl).mockClear();
});

describe("DevToolsSection", () => {
  it("lists every dialog that can pop up", () => {
    render(<DevToolsSection />);
    const rows = document.querySelectorAll(".settings-row");
    expect(rows).toHaveLength(8);
    for (const label of [
      "Reset all settings",
      "Reset usage data",
      "Extended click speed limit",
      "Restart as administrator",
      "Administrator window prompt",
      "Donation reminder",
      "Update available banner",
      "Update preview",
    ]) {
      expect(openRow(label)).toBeEnabled();
    }
  });

  it("opens the update banner with inert buttons", async () => {
    render(<DevToolsSection />);
    const user = userEvent.setup();
    expect(screen.queryByText("9.9.9")).toBeNull();
    await user.click(openRow("Update available banner"));
    expect(await screen.findByText("9.9.9")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Download and Install" }),
    );
    await user.click(screen.getByRole("button", { name: "Preview Changes" }));
    expect(check).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
    expect(tauri.invokes()).toHaveLength(0);

    await user.keyboard("{Escape}");
    expect(screen.queryByText("9.9.9")).toBeNull();

    await user.click(openRow("Update available banner"));
    await screen.findByText("9.9.9");
    await user.click(document.querySelector(".dev-banner-layer")!);
    expect(screen.queryByText("9.9.9")).toBeNull();
  });

  it("opens the reset settings confirmation without resetting anything", async () => {
    render(<DevToolsSection />);
    const user = userEvent.setup();
    await user.click(openRow("Reset all settings"));
    const dialog = await screen.findByRole("dialog", {
      name: "Reset all settings",
    });
    await user.click(within(dialog).getByRole("button", { name: "Reset" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(tauri.invokes()).toHaveLength(0);
  });

  it("opens the other confirmations in preview mode", async () => {
    render(<DevToolsSection />);
    const user = userEvent.setup();

    await user.click(openRow("Reset usage data"));
    let dialog = await screen.findByRole("dialog", {
      name: "Reset usage data",
    });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await user.click(openRow("Extended click speed limit"));
    dialog = await screen.findByRole("dialog", {
      name: "Enable extended click speed limit?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await user.click(openRow("Restart as administrator"));
    dialog = await screen.findByRole("dialog", {
      name: "Restart as administrator?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Restart now" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(tauri.invokes()).toHaveLength(0);
  });

  it("opens the administrator prompt without touching the elevation state", async () => {
    render(<DevToolsSection />);
    const user = userEvent.setup();
    await user.click(openRow("Administrator window prompt"));
    expect(
      await screen.findByRole("heading", {
        name: "Task Manager is running as administrator",
      }),
    ).toBeInTheDocument();
    const toggle = screen.getByRole("button", {
      name: "Always start as administrator",
    });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(tauri.invokes()).toHaveLength(0);
  });

  it("opens the update preview with sample changelog entries", async () => {
    render(<DevToolsSection />);
    const user = userEvent.setup();
    await user.click(openRow("Update preview"));
    expect(
      await screen.findByRole("heading", {
        name: "Updates from v3.9.6 to 9.9.9",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sample feature added for the preview."),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Close changelog preview" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(tauri.invokes()).toHaveLength(0);
  });

  it("opens the donation reminder and its support button works", async () => {
    render(<DevToolsSection />);
    const user = userEvent.setup();

    await user.click(openRow("Donation reminder"));
    const dialog = await screen.findByRole("dialog", {
      name: /You've reached 1 million clicks/,
    });

    await user.click(
      within(dialog).getByRole("button", { name: "Support Me" }),
    );
    expect(openUrl).toHaveBeenCalledWith("https://ko-fi.com/Z8Z71T8QD4");
    expect(await screen.findByText("Thank you.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {
      timeout: 4000,
    });
    expect(
      tauri.invokes().filter((call) => call.command !== "get_cursor_position"),
    ).toHaveLength(0);
  });
});
