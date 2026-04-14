import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  captureHotkey,
  captureMouseHotkey,
  captureWheelHotkey,
  formatHotkeyForDisplay,
  getKeyboardLayoutMap,
} from "../hotkeys";

interface Props {
  value: string;
  onChange: (next: string) => void;
  className: string;
  style?: React.CSSProperties;
}

export default function HotkeyCaptureInput({
  value,
  onChange,
  className,
  style,
}: Props) {
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [layoutMap, setLayoutMap] = useState<Awaited<ReturnType<typeof getKeyboardLayoutMap>>>(null);

  useEffect(() => {
    let active = true;

    getKeyboardLayoutMap().then((map) => {
      if (active) {
        setLayoutMap(map);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    invoke("set_hotkey_capture_active", { active: listening }).catch((err) => {
      console.error("Failed to toggle hotkey capture state:", err);
    });

    return () => {
      if (!listening) return;

      invoke("set_hotkey_capture_active", { active: false }).catch((err) => {
        console.error("Failed to clear hotkey capture state:", err);
      });
    };
  }, [listening]);

  useEffect(() => {
    if (!listening) return;

    let captured = false;
    const handleMouseEvent = (event: MouseEvent) => {
      const nextHotkey = captureMouseHotkey(event);
      if (!nextHotkey || captured) return;

      captured = true;
      event.preventDefault();
      event.stopPropagation();
      onChange(nextHotkey);
      setListening(false);
      inputRef.current?.blur();
    };

    const handleWheelEvent = (event: WheelEvent) => {
      const nextHotkey = captureWheelHotkey(event);
      if (!nextHotkey || captured) return;

      captured = true;
      event.preventDefault();
      event.stopPropagation();
      onChange(nextHotkey);
      setListening(false);
      inputRef.current?.blur();
    };

    window.addEventListener("mousedown", handleMouseEvent, true);
    window.addEventListener("mouseup", handleMouseEvent, true);
    window.addEventListener("auxclick", handleMouseEvent, true);
    window.addEventListener("wheel", handleWheelEvent, {
      capture: true,
      passive: false,
    });

    return () => {
      window.removeEventListener("mousedown", handleMouseEvent, true);
      window.removeEventListener("mouseup", handleMouseEvent, true);
      window.removeEventListener("auxclick", handleMouseEvent, true);
      window.removeEventListener("wheel", handleWheelEvent, true);
    };
  }, [listening, onChange]);

  const displayText = useMemo(
    () => (listening ? "Press keys, click, or scroll..." : formatHotkeyForDisplay(value, layoutMap)),
    [layoutMap, listening, value],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      onChange("");
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

    const nextHotkey = captureHotkey(event);
    if (!nextHotkey) return;

    onChange(nextHotkey);
    setListening(false);
    event.currentTarget.blur();
  };

  return (
    <input
      ref={inputRef}
      type="text"
      className={className}
      value={displayText}
      readOnly
      onFocus={() => setListening(true)}
      onBlur={() => setListening(false)}
      onKeyDown={handleKeyDown}
      spellCheck={false}
      style={style}
    />
  );
}
