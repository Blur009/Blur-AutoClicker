import { useEffect, useRef, useState } from "react";

interface Props {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  optional?: boolean;
  placeholder?: string;
}

function toHex(color: string): string | null {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    return "#" + color.slice(1).split("").map((c) => c + c).join("");
  }
  return null;
}

export default function ColorPickerInput({ label, value, onChange, optional, placeholder }: Props) {
  const [text, setText] = useState(value);
  const lastValidRef = useRef(value);

  useEffect(() => {
    setText(value);
    lastValidRef.current = value;
  }, [value]);

  const hexValue = toHex(value) ?? "#121212";

  const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value;
    lastValidRef.current = hex;
    setText(hex);
    onChange(hex);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
  };

  const handleTextBlur = () => {
    const hex = toHex(text.trim());
    if (hex) {
      lastValidRef.current = hex;
      onChange(hex);
    } else {
      setText(lastValidRef.current);
    }
  };

  const handleReset = () => {
    setText("");
    onChange("");
  };

  return (
    <div className="color-picker-row">
      <span className="color-picker-label">{label}</span>
      <div className="color-picker-controls">
        <div className="color-picker-swatch-wrap">
          <input
            type="color"
            className="color-picker-native"
            value={hexValue}
            onChange={handleNativeChange}
          />
          <div
            className="color-picker-swatch"
            style={{ background: value || "transparent" }}
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
        {optional && value && (
          <button className="color-picker-reset" onClick={handleReset} title="Reset to derived">
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
