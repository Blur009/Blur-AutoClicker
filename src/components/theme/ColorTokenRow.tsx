import { useState, type ChangeEvent } from "react";
import ColorPicker from "../ColorPicker";
import {
  normalizeHex,
  type ThemeColor,
  type ThemeTokenMeta,
} from "../../themeModel";
import ResetButton from "./ResetButton";
import { themeValueEquals } from "./themeEditorShared";

interface Props {
  meta: ThemeTokenMeta;
  value: ThemeColor;
  template: ThemeColor;
  onChange: (value: ThemeColor) => void;
}

interface HexFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function HexField({ id, label, value, onChange }: HexFieldProps) {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  const [focused, setFocused] = useState(false);

  if (value !== lastValue) {
    setLastValue(value);
    if (!focused) setDraft(value);
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    setDraft(raw);
    const normalized = normalizeHex(raw, "");
    if (normalized) onChange(normalized);
  };

  return (
    <input
      id={id}
      className="theme-input theme-hex-input"
      value={draft}
      maxLength={7}
      spellCheck={false}
      autoComplete="off"
      aria-label={`${label} hex value`}
      placeholder="#rrggbb"
      onChange={handleChange}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setDraft(value);
      }}
    />
  );
}

export default function ColorTokenRow({
  meta,
  value,
  template,
  onChange,
}: Props) {
  const inputId = `theme-token-${meta.key}`;

  return (
    <div className="theme-token-row">
      <label className="theme-token-label" htmlFor={inputId}>
        {meta.label}
      </label>
      <div className="theme-token-controls">
        <ColorPicker
          value={value.hex}
          onChange={(hex) => onChange({ hex, alpha: value.alpha })}
          label={`${meta.label} color`}
        />
        <HexField
          id={inputId}
          label={meta.label}
          value={value.hex}
          onChange={(hex) => onChange({ hex, alpha: value.alpha })}
        />
        <div className="theme-token-alpha">
          <input
            className="theme-alpha-slider"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={value.alpha}
            aria-label={`${meta.label} opacity`}
            onChange={(event) =>
              onChange({ hex: value.hex, alpha: Number(event.target.value) })
            }
          />
          <span className="theme-alpha-value">
            {Math.round(value.alpha * 100)}%
          </span>
        </div>
      </div>
      <ResetButton
        label={`Reset ${meta.label} color`}
        disabled={themeValueEquals(value, template)}
        onClick={() => onChange({ ...template })}
      />
    </div>
  );
}
