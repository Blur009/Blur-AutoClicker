import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import DonationPrompt from "../components/DonationPrompt";
import type { DonationPrompt as DonationPromptState } from "../donationReminders";
import { installBrowserGlobals, tauri } from "./tauriHarness";

vi.mock(
  "@tauri-apps/api/core",
  async () => (await import("./tauriHarness")).coreModule,
);

const first: DonationPromptState = {
  milestone: {
    kind: "clicks",
    threshold: 1_000_000,
    label: "1 million clicks",
  },
  current: 1_247_301,
};

const second: DonationPromptState = {
  milestone: {
    kind: "time",
    threshold: 5 * 3600,
    label: "5 hours of clicking",
  },
  current: 5.5 * 3600,
};

function setup(prompt: DonationPromptState | null) {
  const onSupport = vi.fn();
  const onAcknowledge = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <DonationPrompt
      prompt={prompt}
      onSupport={onSupport}
      onAcknowledge={onAcknowledge}
      onClose={onClose}
    />,
  );
  return { view, onSupport, onAcknowledge, onClose };
}

function rerenderInto(
  view: ReturnType<typeof setup>,
  prompt: DonationPromptState | null,
) {
  view.view.rerender(
    <DonationPrompt
      prompt={prompt}
      onSupport={view.onSupport}
      onAcknowledge={view.onAcknowledge}
      onClose={view.onClose}
    />,
  );
}

beforeEach(() => {
  tauri.reset();
  installBrowserGlobals();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    null as unknown as CanvasRenderingContext2D,
  );
});

describe("DonationPrompt", () => {
  it("shows the milestone, the exact count and both buttons", () => {
    setup(first);

    expect(
      screen.getByRole("dialog", { name: /You've reached 1 million clicks/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("1,247,301 clicks recorded so far"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "No, Thank you" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Support Me" }),
    ).toBeInTheDocument();
  });

  it("renders the confirmation after a choice", () => {
    const { onAcknowledge, onSupport } = setup(first);

    fireEvent.click(screen.getByRole("button", { name: "Support Me" }));

    expect(onSupport).toHaveBeenCalledTimes(1);
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Thank you.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("does not acknowledge twice for one prompt", () => {
    const { onAcknowledge } = setup(first);

    fireEvent.click(screen.getByRole("button", { name: "No, Thank you" }));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });

  it("starts fresh for the next milestone", () => {
    const view = setup(first);

    fireEvent.click(screen.getByRole("button", { name: "No, Thank you" }));
    expect(screen.getByText("Enjoy the autoclicker.")).toBeInTheDocument();

    rerenderInto(view, second);

    expect(screen.queryByText("Enjoy the autoclicker.")).toBeNull();
    expect(screen.getByText("5 hours of clicking")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "No, Thank you" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "No, Thank you" }));

    expect(view.onAcknowledge).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Enjoy the autoclicker.")).toBeInTheDocument();
  });

  it("renders nothing without a prompt", () => {
    setup(null);

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
