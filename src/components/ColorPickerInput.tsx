import { useEffect, useRef, useState } from "react";
import { splitHexAlpha, combineHexAlpha } from "../utils/theme";

interface Props {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  optional?: boolean;
  placeholder?: string;
  allowAlpha?: boolean;
}

function normalizeHex6(color: string): string | null {
  const t = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(t)) {
    return (
      "#" +
      t
        .slice(1)
        .split("")
        .map((c) => c + c)
        .join("")
    ).toLowerCase();
  }
  if (/^#[0-9a-fA-F]{8}$/.test(t)) return t.slice(0, 7).toLowerCase();
  return null;
}

export default function ColorPickerInput({
  label,
  value,
  onChange,
  optional,
  placeholder,
  allowAlpha,
}: Props) {
  const parsed = value ? splitHexAlpha(value) : { hex6: "", alpha: 1 };
  const [text, setText] = useState(parsed.hex6);
  const lastValidRef = useRef(parsed.hex6);

  useEffect(() => {
    const p = value ? splitHexAlpha(value) : { hex6: "", alpha: 1 };
    setText(p.hex6);
    lastValidRef.current = p.hex6;
  }, [value]);

  const commit = (hex6: string, alpha: number) => {
    const combined = allowAlpha ? combineHexAlpha(hex6, alpha) : hex6;
    lastValidRef.current = hex6;
    onChange(combined);
  };

  const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value.toLowerCase();
    setText(hex);
    commit(hex, parsed.alpha);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
  };

  const handleTextBlur = () => {
    const hex = normalizeHex6(text);
    if (hex) {
      setText(hex);
      commit(hex, parsed.alpha);
    } else {
      setText(lastValidRef.current);
    }
  };

  const handleAlphaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = parseInt(e.target.value, 10);
    if (Number.isNaN(pct)) return;
    commit(parsed.hex6 || lastValidRef.current || "#121212", pct / 100);
  };

  const handleClear = () => {
    setText("");
    onChange("");
  };

  const swatchColor = parsed.hex6
    ? `rgba(${parseInt(parsed.hex6.slice(1, 3), 16)}, ${parseInt(parsed.hex6.slice(3, 5), 16)}, ${parseInt(parsed.hex6.slice(5, 7), 16)}, ${parsed.alpha})`
    : "transparent";
  const pickerHex = parsed.hex6 || "#121212";

  return (
    <div className="color-picker-row">
      <span className="color-picker-label">{label}</span>
      <div className="color-picker-controls">
        <div className="color-picker-swatch-wrap">
          <input
            type="color"
            className="color-picker-native"
            value={pickerHex}
            onChange={handleNativeChange}
          />
          <div
            className="color-picker-swatch"
            style={{ background: swatchColor }}
          />
        </div>
        <input
          type="text"
          className="color-picker-text"
          value={text}
          placeholder={placeholder ?? "#rrggbb"}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          spellCheck={false}
        />
        {allowAlpha && value && (
          <div
            className="color-picker-alpha"
            title={`Opacity: ${Math.round(parsed.alpha * 100)}%`}
          >
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(parsed.alpha * 100)}
              onChange={handleAlphaChange}
              className="color-picker-alpha-range"
              aria-label={`${label} opacity`}
            />
            <span className="color-picker-alpha-value">
              {Math.round(parsed.alpha * 100)}%
            </span>
          </div>
        )}
        {optional && value && (
          <button
            className="color-picker-reset"
            onClick={handleClear}
            title="Reset to derived"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
