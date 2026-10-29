import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DutyCycleSection from "../components/panels/advanced/sections/DutyCycleSection";
import { createDefaultSettings, type Settings } from "../settingsSchema";

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return { ...createDefaultSettings("0.0.0"), ...overrides };
}

describe("DutyCycleSection hold mode", () => {
  it("writes one click per day into both representations", async () => {
    const update = vi.fn();
    const settings = makeSettings({
      rateInputMode: "duration",
      durationHours: 0,
      durationMinutes: 0,
      durationSeconds: 3,
      durationMilliseconds: 250,
    });
    render(<DutyCycleSection settings={settings} update={update} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Hold" }));

    expect(update).toHaveBeenCalledWith({
      dutyCycleMode: "Hold",
      savedClickSpeed: settings.clickSpeed,
      savedClickInterval: settings.clickInterval,
      savedDutyCycle: settings.dutyCycle,
      savedDurationMs: 3250,
      clickSpeed: 1,
      clickInterval: "d",
      dutyCycle: 100,
      durationHours: 24,
      durationMinutes: 0,
      durationSeconds: 0,
      durationMilliseconds: 0,
    });
  });

  it("restores the saved interval when leaving hold mode", async () => {
    const update = vi.fn();
    const settings = makeSettings({
      dutyCycleMode: "Hold",
      dutyCycle: 100,
      clickSpeed: 1,
      clickInterval: "d",
      savedClickSpeed: 12,
      savedClickInterval: "m",
      savedDutyCycle: 60,
      savedDurationMs: 2500,
      rateInputMode: "duration",
      durationHours: 24,
      durationMinutes: 0,
      durationSeconds: 0,
      durationMilliseconds: 0,
    });
    render(<DutyCycleSection settings={settings} update={update} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Click" }));

    expect(update).toHaveBeenCalledWith({
      dutyCycleMode: "Click",
      clickSpeed: 12,
      clickInterval: "m",
      dutyCycle: 60,
      durationHours: 0,
      durationMinutes: 0,
      durationSeconds: 2,
      durationMilliseconds: 500,
    });
  });

  it("leaves rate mode users with one click per day too", async () => {
    const update = vi.fn();
    const settings = makeSettings({
      rateInputMode: "rate",
      clickSpeed: 25,
      clickInterval: "s",
    });
    render(<DutyCycleSection settings={settings} update={update} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Hold" }));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        clickSpeed: 1,
        clickInterval: "d",
        durationHours: 24,
        durationMinutes: 0,
        durationSeconds: 0,
        durationMilliseconds: 0,
      }),
    );
  });
});
