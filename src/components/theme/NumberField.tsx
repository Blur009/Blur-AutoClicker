import { useState, type ChangeEvent } from "react";

interface Props {
  id: string;
  value: number;
  min: number;
  max: number;
  step: number;
  describedBy?: string;
  onChange: (value: number) => void;
}

export default function NumberField({
  id,
  value,
  min,
  max,
  step,
  describedBy,
  onChange,
}: Props) {
  const [draft, setDraft] = useState(() => String(value));
  const [lastValue, setLastValue] = useState(value);
  const [focused, setFocused] = useState(false);

  if (value !== lastValue) {
    setLastValue(value);
    if (!focused) setDraft(String(value));
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    setDraft(raw);
    const parsed = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(parsed)) return;
    onChange(Math.min(Math.max(parsed, min), max));
  };

  return (
    <input
      id={id}
      className="theme-input theme-number-input"
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={draft}
      aria-describedby={describedBy}
      onChange={handleChange}
      onFocus={() => setFocused(true)}
      onWheel={(event) => event.currentTarget.blur()}
      onBlur={() => {
        setFocused(false);
        setDraft(String(value));
      }}
    />
  );
}
