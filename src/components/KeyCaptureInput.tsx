import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  captureHotkey,
  formatHotkeyForDisplay,
  getKeyboardLayoutMap,
} from "../hotkeys";
import { isAlphabeticKeyboardKey } from "../keyboardKeyCase";
import type { KeyboardKeyCase, MouseButton } from "../store";

interface Props {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  style?: CSSProperties;
  keyboardKeyCase?: KeyboardKeyCase;
  onMouseButtonCapture?: (button: MouseButton) => void;
}

// Bare modifier presses can't serve as the auto-press key — stripping the
// modifier flags in captureHotkey would pass "ctrl"/"shift"/"alt"/"meta"
// through, and the backend parse_hotkey_main_key rejects those, leaving
// keyboardKey in an unusable state. Ignore them and stay in listening mode.
const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

function applyKeyboardKeyCase(
  value: string,
  displayText: string,
  keyboardKeyCase?: KeyboardKeyCase,
) {
  if (!keyboardKeyCase || !isAlphabeticKeyboardKey(value)) {
    return displayText;
  }

  return keyboardKeyCase === "upper"
    ? displayText.toUpperCase()
    : displayText.toLowerCase();
}

export default function KeyCaptureInput({
  value,
  onChange,
  className,
  style,
  keyboardKeyCase,
  onMouseButtonCapture,
}: Props) {
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rightClickStartedWhileListeningRef = useRef(false);
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
    return applyKeyboardKeyCase(
      value,
      formatHotkeyForDisplay(value, layoutMap),
      keyboardKeyCase,
    );
  }, [keyboardKeyCase, layoutMap, listening, value]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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

    // Ignore bare modifier presses — user is still in the middle of picking a key.
    if (MODIFIER_KEYS.has(event.key)) return;

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

  const handleMouseDown = (event: MouseEvent<HTMLInputElement>) => {
    if (event.button !== 2) return;

    rightClickStartedWhileListeningRef.current = listening;
    if (!listening) {
      event.preventDefault();
    }
  };

  const handleContextMenu = (event: MouseEvent<HTMLInputElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (rightClickStartedWhileListeningRef.current) {
      onMouseButtonCapture?.("Right");
      setListening(false);
      inputRef.current?.blur();
    } else {
      onChange("");
      setListening(false);
      inputRef.current?.blur();
    }

    rightClickStartedWhileListeningRef.current = false;
  };

  return (
    <input
      ref={inputRef}
      type="text"
      className={className}
      value={displayText}
      readOnly
      onMouseDown={handleMouseDown}
      onFocus={() => setListening(true)}
      onBlur={() => setListening(false)}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      spellCheck={false}
      title="Right click input to clear"
      style={{
        cursor: "pointer",
        textAlign: "center",
        ...style,
      }}
    />
  );
}
