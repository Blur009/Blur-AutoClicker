import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../settingsSchema";
import DutyCycleSection from "../components/panels/advanced/DutyCycleSection";

describe("DutyCycleSection", () => {
  it("disables Click Duration for enabled key-only sequences", () => {
    const settings = {
      ...createDefaultSettings("test"),
      sequenceEnabled: true,
      sequencePoints: [
        {
          id: "key",
          action: "key" as const,
          key: "w",
          keyCase: "lower" as const,
          holdMs: 30,
          clicks: 1,
        },
      ],
    };

    render(
      <DutyCycleSection
        settings={settings}
        update={vi.fn()}
        showInfo={false}
      />,
    );

    expect(screen.getByRole("spinbutton")).toBeDisabled();
  });

  it("keeps Click Duration editable when a sequence includes mouse actions", () => {
    const settings = {
      ...createDefaultSettings("test"),
      sequenceEnabled: true,
      sequencePoints: [
        {
          id: "mouse",
          action: "mouse" as const,
          x: 10,
          y: 20,
          clicks: 1,
        },
      ],
    };

    render(
      <DutyCycleSection
        settings={settings}
        update={vi.fn()}
        showInfo={false}
      />,
    );

    expect(screen.getByRole("spinbutton")).not.toBeDisabled();
  });
});
