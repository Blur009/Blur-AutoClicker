import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { logDiagnostic } from "../diagnostics";
import {
  buildHotkeyWithHeld,
  captureHotkey,
  captureModifierHotkey,
  formatHotkeyForDisplay,
  getKeyboardLayoutMap,
  getMainKey,
  getStateClass,
  sortHeld,
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
  conflicts?: string[];
}

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
  conflicts,
}: Props) {
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLButtonElement | null>(null);
  const [layoutMap, setLayoutMap] =
    useState<Awaited<ReturnType<typeof getKeyboardLayoutMap>>>(null);
  const onChangeRef = useRef(onChange);
  const onMouseButtonCaptureRef = useRef(onMouseButtonCapture);
  const comboRef = useRef<string | null>(null);
  const capturedModifiersRef = useRef<string[]>([]);

  useEffect(() => {
    onChangeRef.current = onChange;
    onMouseButtonCaptureRef.current = onMouseButtonCapture;
  });

  useEffect(() => {
    let active = true;
    getKeyboardLayoutMap().then((map) => {
      if (active) setLayoutMap(map);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!listening) return;

    invoke("set_hotkey_capture_active", { active: true }).catch((err) => {
      logDiagnostic("KeyCaptureInput.toggle", {
        error: String(err),
      });
    });

    return () => {
      invoke("set_hotkey_capture_active", { active: false }).catch((err) => {
        logDiagnostic("KeyCaptureInput.clear", {
          error: String(err),
        });
      });
    };
  }, [listening]);

  const displayText = useMemo(() => {
    if (listening) return "Press a key\u2026";
    if (!value) return "Select key";
    return applyKeyboardKeyCase(
      value,
      formatHotkeyForDisplay(value, layoutMap),
      keyboardKeyCase,
    );
  }, [keyboardKeyCase, layoutMap, listening, value]);

  useEffect(() => {
    if (!listening) return;
    comboRef.current = null;
    capturedModifiersRef.current = [];

    const finishCapture = (nextValue?: string) => {
      if (nextValue !== undefined) {
        onChangeRef.current(nextValue);
      }
      comboRef.current = null;
      setListening(false);
      inputRef.current?.blur();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;

      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape" || event.code === "Escape") {
        finishCapture("escape");
        return;
      }

      if (event.key === "Backspace") {
        finishCapture("backspace");
        return;
      }

      if (event.key === "Delete") {
        finishCapture("delete");
        return;
      }

      const modifierHit = captureModifierHotkey(event);
      if (modifierHit) {
        comboRef.current = comboRef.current
          ? `${comboRef.current}+${modifierHit}`
          : modifierHit;
        if (!capturedModifiersRef.current.includes(modifierHit)) {
          capturedModifiersRef.current.push(modifierHit);
        }
        return;
      }

      const mainKey = getMainKey(event);
      if (mainKey) {
        const held = capturedModifiersRef.current;
        const captured =
          held.length > 0
            ? buildHotkeyWithHeld(mainKey, held)
            : captureHotkey(event);
        if (captured) {
          finishCapture(captured);
        }
        return;
      }
      const captured = captureHotkey(event);
      if (captured) {
        finishCapture(captured);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const modifierHit = captureModifierHotkey(event);
      if (!modifierHit) return;

      if (comboRef.current) {
        const parts = comboRef.current
          .split("+")
          .filter((part) => part !== modifierHit);
        comboRef.current = parts.length ? parts.join("+") : null;
        if (!comboRef.current) {
          // All keys released with no main key captured: commit the full
          // modifier chord (e.g. "leftctrl+leftshift") instead of just the
          // last-released modifier.
          const full = sortHeld(capturedModifiersRef.current).join("+");
          finishCapture(full || undefined);
        }
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      onMouseButtonCaptureRef.current?.("Right");
      finishCapture();
    };

    const handleBlur = () => {
      comboRef.current = null;
      capturedModifiersRef.current = [];
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("contextmenu", handleContextMenu, true);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("contextmenu", handleContextMenu, true);
      window.removeEventListener("blur", handleBlur);
    };
  }, [listening]);

  const hasConflict = conflicts !== undefined && conflicts.length > 0;
  const stateClass = getStateClass(listening, hasConflict, !!value);

  return (
    <div className={`hk-wrapper ${stateClass}`}>
      <button
        ref={inputRef}
        type="button"
        className={`${className ?? ""} hk-button`}
        style={{
          ...style,
          paddingRight: value && !listening ? "1.25rem" : undefined,
        }}
        onClick={() => {
          invoke("stop_clicker").catch((err) => {
            logDiagnostic("KeyCaptureInput.stopClicker", {
              error: String(err),
            });
          });
          setListening(true);
        }}
        onBlur={() => {
          if (listening) {
            setListening(false);
          }
        }}
        title={
          hasConflict ? `Already bound to: ${conflicts!.join(", ")}` : undefined
        }
      >
        {displayText}
      </button>
      {value && !listening && (
        <button
          type="button"
          className="hk-clear-btn"
          onClick={(e) => {
            e.stopPropagation();
            invoke("stop_clicker").catch((err) => {
              logDiagnostic("KeyCaptureInput.clear", {
                error: String(err),
              });
            });
            onChange("");
          }}
          title="Clear key"
        >
          ×
        </button>
      )}
    </div>
  );
}
