import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmDialog from "../components/ConfirmDialog";

const props = {
  open: true,
  title: "Restart as administrator?",
  message: "The app closes and reopens with administrator rights.",
  confirmLabel: "Restart now",
  cancelLabel: "Not now",
  onConfirm: () => {},
  onCancel: () => {},
};

function renderWithAppRoot() {
  const root = document.createElement("div");
  root.className = "app-root";
  document.body.appendChild(root);
  const view = render(<ConfirmDialog {...props} />);
  return {
    root,
    container: view.container,
    cleanup: () => {
      view.unmount();
      root.remove();
    },
  };
}

describe("ConfirmDialog", () => {
  it("renders nothing while closed", () => {
    const { container } = render(<ConfirmDialog {...props} open={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(document.body.querySelector(".confirm-dialog-backdrop")).toBeNull();
  });

  it("mounts on the app root so scrolling panels cannot clip it", () => {
    const { root, container, cleanup } = renderWithAppRoot();
    try {
      expect(container).toBeEmptyDOMElement();
      expect(root.querySelector(".confirm-dialog-backdrop")).not.toBeNull();
      expect(
        root.querySelector(".confirm-dialog-backdrop > .confirm-dialog"),
      ).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it("falls back to the document body without an app root", () => {
    const { container } = render(<ConfirmDialog {...props} />);
    expect(container).toBeEmptyDOMElement();
    expect(
      document.body.querySelector(".confirm-dialog-backdrop")?.parentElement,
    ).toBe(document.body);
  });

  it("focuses cancel so a stray Enter is harmless", () => {
    render(<ConfirmDialog {...props} />);
    expect(screen.getByRole("button", { name: "Not now" })).toHaveFocus();
  });

  it("ignores escape while the elevation prompt covers it", () => {
    const root = document.createElement("div");
    root.className = "app-root";
    root.setAttribute("data-elevation-prompt", "true");
    document.body.appendChild(root);
    const onCancel = vi.fn();
    const view = render(<ConfirmDialog {...props} onCancel={onCancel} />);
    try {
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onCancel).not.toHaveBeenCalled();
    } finally {
      view.unmount();
      root.remove();
    }
  });

  it("labels itself from the title and message", () => {
    render(<ConfirmDialog {...props} />);
    const dialog = screen.getByRole("dialog", { name: props.title });
    expect(dialog).toHaveAttribute(
      "aria-describedby",
      "confirm-dialog-message",
    );
    expect(screen.getByText(props.message)).toHaveAttribute(
      "id",
      "confirm-dialog-message",
    );
  });

  it("confirms, cancels and closes on escape or backdrop click", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog {...props} onConfirm={onConfirm} onCancel={onCancel} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Restart now" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(2);
    await user.click(document.body.querySelector(".confirm-dialog-backdrop")!);
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it("ignores escape and backdrop clicks while busy", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        {...props}
        busy
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const user = userEvent.setup();
    expect(screen.getByRole("button", { name: "Not now" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Working..." })).toBeDisabled();
    await user.keyboard("{Escape}");
    await user.click(document.body.querySelector(".confirm-dialog-backdrop")!);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
