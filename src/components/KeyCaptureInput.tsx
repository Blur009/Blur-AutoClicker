import { useEffect, useMemo, useState } from "react";
import {
  captureHotkey,
  formatHotkeyForDisplay,
  getKeyboardLayoutMap,
} from "../hotkeys";

interface Props {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  style?: React.CSSProperties;
  onContextMenu?: (e: React.MouseEvent<HTMLInputElement>) => void;
}

export default function KeyCaptureInput({
  value,
  onChange,
  className,
  style,
  onContextMenu,
}: Props) {
  const [listening, setListening] = useState(false);
  const [layoutMap, setLayoutMap] =
    useState<Awaited<ReturnType<typeof getKeyboardLayoutMap>>>(null);

  useEffect(() => {
    let active = true;
    getKeyboardLayoutMap().then((map) => {
      if (active) setLayoutMap(map);
    });
    return () => {
      active = false;
    };
  }, []);

  const displayText = useMemo(() => {
    if (listening) return "Press a key...";
    if (!value) return "Select key";
    return formatHotkeyForDisplay(value, layoutMap);
  }, [layoutMap, listening, value]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      setListening(false);
      event.currentTarget.blur();
      return;
    }

    if (
      (event.key === "Backspace" || event.key === "Delete") &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey &&
      !event.metaKey
    ) {
      onChange("");
      setListening(false);
      event.currentTarget.blur();
      return;
    }

    // Capture without modifiers — we only want the main key
    const captured = captureHotkey({
      key: event.key,
      code: event.code,
      location: event.location,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    });

    if (captured) {
      // Strip any modifier prefixes (shouldn't have any, but be safe)
      const mainKey = captured.split("+").pop() ?? captured;
      onChange(mainKey);
      setListening(false);
      event.currentTarget.blur();
    }
  };

  return (
    <input
      type="text"
      className={className}
      value={displayText}
      readOnly
      onFocus={() => setListening(true)}
      onBlur={() => setListening(false)}
      onKeyDown={handleKeyDown}
      onContextMenu={onContextMenu}
      spellCheck={false}
      title="Click and press a key to select which key gets auto-pressed. Right-click to switch to Mouse mode."
      style={{
        cursor: "pointer",
        textAlign: "center",
        ...style,
      }}
    />
  );
}
