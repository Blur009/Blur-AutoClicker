import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ElevationPrompt from "../components/ElevationPrompt";

const handlers = {
  canElevate: true,
  alwaysRunAsAdmin: false,
  busy: false,
  onRestart: () => {},
  onAlwaysRunChange: () => {},
  onDismiss: () => {},
};

describe("ElevationPrompt", () => {
  it("renders nothing while closed", () => {
    const { container } = render(
      <ElevationPrompt open={false} {...handlers} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("reports restart and dismiss clicks", async () => {
    const onRestart = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ElevationPrompt
        open
        {...handlers}
        onRestart={onRestart}
        onDismiss={onDismiss}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Restart as administrator" }),
    );
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("toggles always start as administrator", async () => {
    const onAlwaysRunChange = vi.fn();
    render(
      <ElevationPrompt
        open
        {...handlers}
        onAlwaysRunChange={onAlwaysRunChange}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Always start as administrator" }),
    );
    expect(onAlwaysRunChange).toHaveBeenCalledWith(true);
  });

  it("refuses to restart when the account cannot elevate", () => {
    render(<ElevationPrompt open {...handlers} canElevate={false} />);
    expect(
      screen.getByRole("button", { name: "Administrator account required" }),
    ).toBeDisabled();
  });
});
