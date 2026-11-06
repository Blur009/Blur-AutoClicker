import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SoundsSection from "../components/panels/settings/sections/SoundsSection";
import { createDefaultSettings } from "../settingsSchema";
import type { Settings } from "../settingsSchema";
import { FakeAudioElement, installFakeAudio } from "./fakeAudio";
import { tauri } from "./tauriHarness";

vi.mock(
  "@tauri-apps/api/core",
  async () => (await import("./tauriHarness")).coreModule,
);

const dialog = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock("@tauri-apps/plugin-dialog", async () => {
  const { dialogModule } = await import("./tauriHarness");
  return { ...dialogModule, open: dialog.open };
});

function stubAudioPipeline(): void {
  const samples = new Float32Array(256);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.sin(i / 8) * (1 - i / samples.length);
  }

  class FakeContext {
    async decodeAudioData() {
      return {
        duration: 1.5,
        getChannelData: () => samples,
      };
    }
  }

  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    writable: true,
    value: FakeContext,
  });

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })),
  );
}

beforeEach(() => {
  tauri.reset();
  installFakeAudio();
  stubAudioPipeline();
  dialog.open.mockReset();
  dialog.open.mockResolvedValue(null);
});

function setup(overrides: Partial<Settings> = {}) {
  const settings = { ...createDefaultSettings("0.0.0"), ...overrides };
  const update = vi.fn();
  const view = render(<SoundsSection settings={settings} update={update} />);
  return { settings, update, ...view };
}

describe("SoundsSection", () => {
  it("shows the three bundled sounds with their default names", () => {
    setup();

    expect(screen.getByText("disable.wav (default)")).toBeInTheDocument();
    expect(screen.getAllByText("enable.wav (default)")).toHaveLength(2);
  });

  it("only offers the reset button once a custom file is picked", () => {
    setup();

    const resetButtons = screen.getAllByLabelText(/Use the default sound for/);
    expect(resetButtons).toHaveLength(3);
    for (const button of resetButtons) {
      expect(button).toBeDisabled();
    }
  });

  it("shows the custom file name next to the picker", () => {
    setup({ disableSoundPath: "C:/sounds/thud.mp3" });

    expect(screen.getByText("thud.mp3")).toBeInTheDocument();
  });

  it("flips the enabled sound toggle", () => {
    const { update } = setup({ enableSoundEnabled: false });

    fireEvent.click(screen.getByLabelText("Auto clicker enabled sound"));

    expect(update).toHaveBeenCalledWith({ enableSoundEnabled: true });
  });

  it("flips the disabled sound toggle", () => {
    const { update } = setup({ disableSoundEnabled: true });

    fireEvent.click(screen.getByLabelText("Auto clicker disabled sound"));

    expect(update).toHaveBeenCalledWith({ disableSoundEnabled: false });
  });

  it("keeps every-click off by default and flips it", () => {
    const { update } = setup({ clickSoundEnabled: false });

    const toggle = screen.getByLabelText("Every click sound");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);
    expect(update).toHaveBeenCalledWith({ clickSoundEnabled: true });
  });

  it("keeps the trim editor folded but mounted, and reports the state", () => {
    setup();

    const toggle = screen.getByRole("button", {
      name: "Auto clicker enabled trim and volume",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByLabelText("Auto clicker enabled sound volume"),
    ).toBeInTheDocument();
    expect(document.querySelector(".sound-details")).toHaveAttribute(
      "data-open",
      "false",
    );

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector(".sound-details")).toHaveAttribute(
      "data-open",
      "true",
    );
  });

  it("describes the folded summary for screen readers", async () => {
    setup({
      enableSoundPath: "C:/sounds/length-test.wav",
      enableSoundTrimStart: 120,
      enableSoundTrimEnd: 380,
    });
    await waitFor(() =>
      expect(FakeAudioElement.instances.length).toBeGreaterThan(0),
    );
    for (const element of FakeAudioElement.instances) {
      element.emitMetadata(1.5);
    }

    const toggle = screen.getByRole("button", {
      name: "Auto clicker enabled trim and volume",
    });
    const describedBy = toggle.getAttribute("aria-describedby") ?? "";
    const ids = describedBy.split(" ").filter(Boolean);

    expect(ids.length).toBe(2);
    for (const id of ids) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    await waitFor(() =>
      expect(document.getElementById(ids[0])).toHaveTextContent("260ms"),
    );
    expect(document.getElementById(ids[1])).toHaveTextContent("50%");
  });

  it("writes the per-sound volume", () => {
    const { update } = setup();

    fireEvent.change(
      screen.getByLabelText("Auto clicker enabled sound volume"),
      {
        target: { value: "70" },
      },
    );

    expect(update).toHaveBeenCalledWith({ enableSoundVolume: 70 });
  });

  it("offers the fast-rate opt-in without unfolding anything", () => {
    const { update } = setup();

    const fastRate = screen.getByRole("button", {
      name: "Allow more than 10 per second",
    });
    expect(fastRate).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByText("Only needed for very fast clicking."),
    ).toBeInTheDocument();

    fireEvent.click(fastRate);
    expect(update).toHaveBeenCalledWith({ clickSoundAllowFastRate: true });
  });

  it("warns once the fast rate is enabled", () => {
    setup({ clickSoundAllowFastRate: true });

    expect(
      screen.getByText("Sounds can overlap or stutter at this rate."),
    ).toBeInTheDocument();
  });

  it("records a picked file and clears the old trim", async () => {
    const { update } = setup({
      recentSoundPaths: [],
      enableSoundTrimStart: 500,
      enableSoundTrimEnd: 900,
    });
    dialog.open.mockResolvedValue("C:/sounds/new.wav");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Choose sound: auto clicker enabled",
      }),
    );

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        enableSoundPath: "C:/sounds/new.wav",
        enableSoundTrimStart: 0,
        enableSoundTrimEnd: 0,
        recentSoundPaths: ["C:/sounds/new.wav"],
      }),
    );
  });

  it("puts the default back with a clean trim", () => {
    const { update } = setup({
      disableSoundPath: "C:/sounds/thud.mp3",
      disableSoundTrimStart: 400,
      disableSoundTrimEnd: 800,
    });

    fireEvent.click(
      screen.getByLabelText("Use the default sound for auto clicker disabled"),
    );

    expect(update).toHaveBeenCalledWith({
      disableSoundPath: "",
      disableSoundTrimStart: 0,
      disableSoundTrimEnd: 0,
    });
  });

  it("picks a recent file into the card", async () => {
    const { update } = setup({ recentSoundPaths: ["C:/sounds/pop.wav"] });

    fireEvent.click(
      screen.getByRole("button", { name: /recent every click sound files/i }),
    );
    fireEvent.click(await screen.findByText("pop.wav"));

    expect(update).toHaveBeenCalledWith({
      clickSoundPath: "C:/sounds/pop.wav",
      clickSoundTrimStart: 0,
      clickSoundTrimEnd: 0,
      recentSoundPaths: ["C:/sounds/pop.wav"],
    });
  });

  it("drops a recent file from the shared list", async () => {
    const { update } = setup({ recentSoundPaths: ["C:/sounds/pop.wav"] });

    fireEvent.click(
      screen.getByRole("button", { name: /recent every click sound files/i }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Remove pop.wav from history",
      }),
    );

    expect(update).toHaveBeenCalledWith({ recentSoundPaths: [] });
  });

  it("previews the clicked sound and stops it on demand", async () => {
    setup({ clickSoundPath: "C:/sounds/preview-one.wav" });

    fireEvent.click(screen.getByRole("button", { name: /every click trim/i }));
    const preview = await screen.findByRole("button", {
      name: /preview every click sound/i,
    });
    await waitFor(() => expect(preview).toBeEnabled());

    fireEvent.click(preview);

    const stop = await screen.findByRole("button", {
      name: /stop every click preview/i,
    });
    await waitFor(() =>
      expect(
        FakeAudioElement.instances.some((entry) => entry.playCalls === 1),
      ).toBe(true),
    );
    const element = FakeAudioElement.instances.find(
      (entry) => entry.playCalls === 1,
    )!;

    fireEvent.click(stop);

    expect(element.pauseCalls).toBeGreaterThan(0);
  });

  it("stops the preview when the editor is folded away", async () => {
    setup({ clickSoundPath: "C:/sounds/preview-two.wav" });

    fireEvent.click(screen.getByRole("button", { name: /every click trim/i }));
    const preview = await screen.findByRole("button", {
      name: /preview every click sound/i,
    });
    await waitFor(() => expect(preview).toBeEnabled());
    fireEvent.click(preview);
    await screen.findByRole("button", { name: /stop every click preview/i });

    const playing = FakeAudioElement.instances.find((entry) => !entry.paused)!;
    fireEvent.click(screen.getByRole("button", { name: /every click trim/i }));

    expect(playing.paused).toBe(true);
  });

  it("never starts a preview that resolves after the editor closed", async () => {
    setup({
      clickSoundPath: "C:/sounds/preview-pending.wav",
      clickSoundTrimStart: 100,
      clickSoundTrimEnd: 300,
    });

    fireEvent.click(screen.getByRole("button", { name: /every click trim/i }));
    const preview = await screen.findByRole("button", {
      name: /preview every click sound/i,
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Every click start")).toBeInTheDocument(),
    );

    fireEvent.click(preview);
    await waitFor(() =>
      expect(FakeAudioElement.instances.length).toBeGreaterThan(1),
    );
    const pending = FakeAudioElement.instances.find(
      (entry) => entry.src.includes("preview-pending") && entry.playCalls === 0,
    )!;

    fireEvent.click(screen.getByRole("button", { name: /every click trim/i }));
    pending.emitMetadata(1.5);

    await waitFor(() => expect(pending.paused).toBe(true));
    expect(pending.playCalls).toBe(0);
  });

  it("stops the preview when the card unmounts", async () => {
    const { unmount } = setup({
      clickSoundPath: "C:/sounds/preview-three.wav",
    });

    fireEvent.click(screen.getByRole("button", { name: /every click trim/i }));
    const preview = await screen.findByRole("button", {
      name: /preview every click sound/i,
    });
    await waitFor(() => expect(preview).toBeEnabled());
    fireEvent.click(preview);
    await screen.findByRole("button", { name: /stop every click preview/i });

    const playing = FakeAudioElement.instances.find((entry) => !entry.paused)!;
    unmount();

    expect(playing.paused).toBe(true);
  });

  it("cannot preview a sound that is turned all the way down", async () => {
    setup({ clickSoundVolume: 0 });

    fireEvent.click(screen.getByRole("button", { name: /every click trim/i }));
    const preview = await screen.findByRole("button", {
      name: /preview every click sound/i,
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Every click start")).toBeInTheDocument(),
    );
    expect(preview).toBeDisabled();
  });

  it("writes the master volume and the mute toggle", () => {
    const { update } = setup();

    fireEvent.change(screen.getByLabelText("Master volume"), {
      target: { value: "40" },
    });
    expect(update).toHaveBeenCalledWith({ soundVolume: 40 });

    fireEvent.click(screen.getByLabelText("Mute all sounds"));
    expect(update).toHaveBeenCalledWith({ soundMuted: true });
  });
});
