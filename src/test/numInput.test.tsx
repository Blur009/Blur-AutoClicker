import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumInput } from "../components/panels/advanced/sections/shared";

function ControlledNumInput({
  initial,
  onChange,
}: {
  initial: number;
  onChange?: (value: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <NumInput
      value={value}
      min={16}
      max={512}
      hoverWheel={false}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe("NumInput", () => {
  it("allows clearing the field without committing a value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledNumInput initial={72} onChange={onChange} />);

    const input = screen.getByRole("textbox");
    await user.clear(input);

    expect(input).toHaveValue("");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not clamp a partly typed number upward", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledNumInput initial={72} onChange={onChange} />);

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "24");

    expect(input).toHaveValue("24");
    expect(onChange).not.toHaveBeenCalledWith(2);
    expect(onChange).toHaveBeenLastCalledWith(24);
  });

  it("clamps out of range values on blur", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledNumInput initial={72} onChange={onChange} />);

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "9");
    expect(input).toHaveValue("9");

    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith(16);
    expect(input).toHaveValue("16");
  });
});
