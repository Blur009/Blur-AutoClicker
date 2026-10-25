import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumInput } from "../components/panels/advanced/sections/shared";
import SimpleCadenceInput from "../components/panels/SimpleCadenceInput";
import { createDefaultSettings } from "../settingsSchema";
import { formatDecimalLocale } from "../numberInput";
import type { Settings } from "../store";

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

function ControlledDecimalNumInput({
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
      min={0.01}
      max={512}
      allowDecimal
      hoverWheel={false}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

function ControlledCadenceInput({
  initial,
  onUpdate,
}: {
  initial: number;
  onUpdate?: (patch: Partial<Settings>) => void;
}) {
  const [settings, setSettings] = useState<Settings>(() => ({
    ...createDefaultSettings("test"),
    rateInputMode: "rate",
    clickSpeed: initial,
    clickInterval: "s",
  }));
  return (
    <SimpleCadenceInput
      settings={settings}
      update={(patch) => {
        onUpdate?.(patch);
        setSettings((prev) => ({ ...prev, ...patch }));
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

  it("commits each typed integer live while keeping the typed text", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledNumInput initial={72} onChange={onChange} />);

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "24");

    expect(input).toHaveValue("24");
    expect(onChange).toHaveBeenLastCalledWith(24);

    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith(24);
  });

  it("commits on Enter without waiting for blur", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledNumInput initial={72} onChange={onChange} />);

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "24{Enter}");

    expect(onChange).toHaveBeenLastCalledWith(24);
    expect(input).toHaveValue("24");
  });

  it("clamps out of range values on blur", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledNumInput initial={72} onChange={onChange} />);

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "9");
    expect(input).toHaveValue("9");
    expect(onChange).not.toHaveBeenCalled();

    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith(16);
    expect(input).toHaveValue("16");
  });

  it("waits for blur before clamping a decimal that is below the minimum", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledDecimalNumInput initial={2} onChange={onChange} />);

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "0");
    expect(input).toHaveValue("0");
    expect(onChange).not.toHaveBeenCalled();

    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith(0.01);
    expect(input).toHaveValue(formatDecimalLocale(0.01));
  });

  it("waits for blur before clamping a decimal that is above the maximum", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledDecimalNumInput initial={2} onChange={onChange} />);

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "600");
    expect(input).toHaveValue("600");
    expect(onChange).not.toHaveBeenCalledWith(600);

    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith(512);
    expect(input).toHaveValue(formatDecimalLocale(512));
  });

  it("commits a decimal before any blur while keeping the typed text", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledDecimalNumInput initial={2} onChange={onChange} />);

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "1");
    await user.type(input, ".");
    await user.type(input, "0");
    expect(input).toHaveValue("1.0");
    expect(onChange).toHaveBeenLastCalledWith(1);

    await user.type(input, "5");
    expect(input).toHaveValue("1.05");
    expect(onChange).toHaveBeenLastCalledWith(1.05);
    expect(input).not.toHaveValue("15");
  });

  it("keeps trailing fractional zeros while typing and commits the decimal once on blur", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledDecimalNumInput initial={2} onChange={onChange} />);

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "1.05");
    expect(input).toHaveValue("1.05");
    expect(onChange).toHaveBeenLastCalledWith(1.05);

    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith(1.05);
    expect(input).not.toHaveValue("15");
    expect(input).toHaveValue(formatDecimalLocale(1.05));
  });

  it("commits a wheel step from the typed draft", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledDecimalNumInput initial={2} onChange={onChange} />);

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "1.05");

    fireEvent.wheel(input, { deltaY: -100 });
    expect(onChange).toHaveBeenLastCalledWith(2.05);
    expect(input).toHaveValue(formatDecimalLocale(2.05));
  });
});

describe("SimpleCadenceInput", () => {
  it("keeps trailing fractional zeros while typing a click speed", async () => {
    const user = userEvent.setup();
    render(<ControlledCadenceInput initial={2} />);

    const input = screen.getByLabelText("Clicks Per");
    await user.clear(input);
    await user.type(input, "1");
    await user.type(input, ".");
    await user.type(input, "0");
    expect(input).toHaveValue("1.0");

    await user.type(input, "5");
    expect(input).toHaveValue("1.05");

    await user.tab();
    expect(input).toHaveValue("1.05");
  });

  it("commits a typed click speed before any blur", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<ControlledCadenceInput initial={2} onUpdate={onUpdate} />);

    const input = screen.getByLabelText("Clicks Per");
    await user.clear(input);
    await user.type(input, "1.05");

    expect(input).toHaveValue("1.05");
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ clickSpeed: 1.05 }),
    );
  });

  it("does not commit a click speed below the minimum until blur", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<ControlledCadenceInput initial={2} onUpdate={onUpdate} />);

    const input = screen.getByLabelText("Clicks Per");
    await user.clear(input);
    await user.type(input, "0");

    expect(input).toHaveValue("0");
    expect(onUpdate).not.toHaveBeenCalled();

    await user.tab();
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ clickSpeed: 1 }),
    );
    expect(input).toHaveValue("1");
  });

  it("steps the wheel from the typed click speed draft", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<ControlledCadenceInput initial={2} onUpdate={onUpdate} />);

    const input = screen.getByLabelText("Clicks Per");
    await user.clear(input);
    await user.type(input, "1.05");

    fireEvent.wheel(input, { deltaY: -100 });
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ clickSpeed: 2.05 }),
    );
    expect(input).toHaveValue("2.05");
  });
});
