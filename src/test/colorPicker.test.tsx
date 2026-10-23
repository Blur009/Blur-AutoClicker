import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ColorPicker from "../components/ColorPicker";

function ControlledColorPicker({
  initial = "#1fc24b",
  onChange,
  onPreview,
}: {
  initial?: string;
  onChange?: (value: string) => void;
  onPreview?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <ColorPicker
      value={value}
      label="Accent color"
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      onPreview={onPreview}
    />
  );
}

describe("ColorPicker", () => {
  it("opens the popover from the swatch trigger", async () => {
    const user = userEvent.setup();
    render(<ControlledColorPicker />);

    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Accent color" }));

    expect(screen.getByRole("dialog", { name: "Accent color" })).toBeTruthy();
    expect(screen.getByLabelText("Hex color value")).toHaveValue("#1FC24B");
  });

  it("commits a typed hex value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledColorPicker onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Accent color" }));

    const hexInput = screen.getByLabelText("Hex color value");
    await user.clear(hexInput);
    await user.type(hexInput, "#FF0000");

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("#ff0000"));
  });

  it("previews a typed hex value", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    render(<ControlledColorPicker onPreview={onPreview} />);
    await user.click(screen.getByRole("button", { name: "Accent color" }));

    const hexInput = screen.getByLabelText("Hex color value");
    await user.clear(hexInput);
    await user.type(hexInput, "#FF0000");

    await waitFor(() => expect(onPreview).toHaveBeenLastCalledWith("#ff0000"));
  });

  it("flags an incomplete hex value without committing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledColorPicker onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Accent color" }));

    const hexInput = screen.getByLabelText("Hex color value");
    await user.clear(hexInput);
    await user.type(hexInput, "#FF00");

    expect(hexInput).toHaveAttribute("aria-invalid", "true");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<ControlledColorPicker />);
    const trigger = screen.getByRole("button", { name: "Accent color" });

    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes when a click lands outside the popover", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">elsewhere</button>
        <ControlledColorPicker />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Accent color" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
