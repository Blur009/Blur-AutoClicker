import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import SoundsSection from "../components/panels/settings/sections/SoundsSection";
import { createDefaultSettings } from "../settingsSchema";
import type { Settings } from "../settingsSchema";

function setup(overrides: Partial<Settings> = {}) {
  const settings = { ...createDefaultSettings("0.0.0"), ...overrides };
  const update = vi.fn();
  render(<SoundsSection settings={settings} update={update} />);
  return { settings, update };
}

describe("SoundsSection", () => {
  it("flips the enabled sound toggle", () => {
    const { update } = setup({ enableSoundEnabled: true });

    fireEvent.click(screen.getByLabelText("Auto clicker enabled"));

    expect(update).toHaveBeenCalledWith({ enableSoundEnabled: false });
  });

  it("flips the disabled sound toggle", () => {
    const { update } = setup({ disableSoundEnabled: true });

    fireEvent.click(screen.getByLabelText("Auto clicker disabled"));

    expect(update).toHaveBeenCalledWith({ disableSoundEnabled: false });
  });

  it("clears a custom path back to the bundled default", () => {
    const { update } = setup({ enableSoundPath: "C:/sounds/pop.wav" });

    fireEvent.click(
      screen.getByLabelText("Use the default sound for auto clicker enabled"),
    );

    expect(update).toHaveBeenCalledWith({ enableSoundPath: "" });
  });

  it("disables the reset button while the default is in use", () => {
    setup();

    const resetButtons = screen.getAllByLabelText(/Use the default sound for/);
    expect(resetButtons).toHaveLength(2);
    for (const button of resetButtons) {
      expect(button).toBeDisabled();
    }
  });

  it("writes the per-sound volume", () => {
    const { update } = setup();

    fireEvent.change(screen.getByLabelText("Auto clicker enabled volume"), {
      target: { value: "70" },
    });

    expect(update).toHaveBeenCalledWith({ enableSoundVolume: 70 });
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

  it("shows the custom file name next to the picker", () => {
    setup({ disableSoundPath: "C:/sounds/thud.mp3" });

    expect(screen.getByText("thud.mp3")).toBeInTheDocument();
    expect(screen.getByText("enable.wav (default)")).toBeInTheDocument();
  });
});
