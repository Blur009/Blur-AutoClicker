import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ElevationPrompt from "../components/ElevationPrompt";

const handlers = {
  canElevate: true,
  alwaysRunAsAdmin: false,
  windowName: "Windows Command Processor",
  windowTitle: "Command Prompt - C:\\Windows\\System32",
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

  it("names the window that is running as administrator", () => {
    render(<ElevationPrompt open {...handlers} />);
    expect(
      screen.getByRole("heading", {
        name: "Windows Command Processor is running as administrator",
      }),
    ).toBeInTheDocument();
    expect(
      document.querySelector(".elevation-prompt-window"),
    ).toHaveTextContent("Command Prompt - C:\\Windows\\System32");
  });

  it("hides the window line when it repeats the name", () => {
    render(
      <ElevationPrompt
        open
        {...handlers}
        windowName="Task Manager"
        windowTitle="Task Manager"
      />,
    );
    expect(document.querySelector(".elevation-prompt-window")).toBeNull();
  });

  it("drops the name and the window line when nothing is known", () => {
    render(<ElevationPrompt open {...handlers} windowName="" windowTitle="" />);
    expect(
      screen.getByRole("heading", {
        name: "An administrator window has focus",
      }),
    ).toBeInTheDocument();
    expect(document.querySelector(".elevation-prompt-window")).toBeNull();
  });

  it("keeps a long window title inside the card", () => {
    const longTitle = `Administrator: ${"Very Long Window Title ".repeat(12)}`;
    render(
      <ElevationPrompt
        open
        {...handlers}
        windowName="Microsoft Management Console"
        windowTitle={longTitle}
      />,
    );
    const line = document.querySelector(".elevation-prompt-window");
    expect(line).toHaveAttribute("title", longTitle);
    expect(line?.textContent).toBe(longTitle);
    expect(
      screen.getByRole("heading", {
        name: "Microsoft Management Console is running as administrator",
      }),
    ).toHaveAttribute("title", "Microsoft Management Console");
  });

  it("ignores case when deciding the window line is redundant", () => {
    render(
      <ElevationPrompt
        open
        {...handlers}
        windowName="Task Manager"
        windowTitle="task manager"
      />,
    );
    expect(document.querySelector(".elevation-prompt-window")).toBeNull();
  });

  it("disables the restart button while restarting", () => {
    render(<ElevationPrompt open {...handlers} busy />);
    expect(screen.getByRole("button", { name: "Restarting…" })).toBeDisabled();
  });

  it("takes focus on the card, not on a setting", () => {
    render(<ElevationPrompt open {...handlers} />);
    expect(document.querySelector(".elevation-prompt-card")).toHaveFocus();
  });

  it("keeps keyboard focus inside the prompt", () => {
    render(<ElevationPrompt open {...handlers} />);
    const toggle = screen.getByRole("button", {
      name: "Always start as administrator",
    });
    const restart = screen.getByRole("button", {
      name: "Restart as administrator",
    });
    fireEvent.keyDown(window, { key: "Tab" });
    expect(toggle).toHaveFocus();
    restart.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(toggle).toHaveFocus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(restart).toHaveFocus();
  });

  it("pulls focus back when it sits outside the card", () => {
    render(<ElevationPrompt open {...handlers} />);
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(
      screen.getByRole("button", { name: "Always start as administrator" }),
    ).toHaveFocus();
    outside.remove();
  });

  it("turns the always-run setting off as well as on", async () => {
    const onAlwaysRunChange = vi.fn();
    render(
      <ElevationPrompt
        open
        {...handlers}
        alwaysRunAsAdmin
        onAlwaysRunChange={onAlwaysRunChange}
      />,
    );
    const toggle = screen.getByRole("button", {
      name: "Always start as administrator",
    });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    const user = userEvent.setup();
    await user.click(toggle);
    expect(onAlwaysRunChange).toHaveBeenCalledWith(false);
  });

  it("refuses to restart when the account cannot elevate", () => {
    render(<ElevationPrompt open {...handlers} canElevate={false} />);
    expect(
      screen.getByRole("button", { name: "Administrator account required" }),
    ).toBeDisabled();
  });
});
