import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  captureHotkey,
  captureModifierHotkey,
  captureMouseHotkey,
  defaultHotkeyLabels,
  formatHotkeyForDisplay,
  getKeyboardLayoutMap,
  getStateClass,
} from "../hotkeys";

interface Props {
  value: string;
  onChange: (next: string) => void;
  className: string;
  style?: React.CSSProperties;
  conflicts?: string[];
  reserved?: boolean;
}

export default function HotkeyCaptureInput({
  value,
  onChange,
  className,
  style,
  conflicts,
  reserved,
}: Props) {
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLButtonElement | null>(null);
  const ignorePrimaryInputMouseUntilRef = useRef(0);
  const suppressedMouseButtonRef = useRef<number | null>(null);
  const suppressResetTimerRef = useRef<number | null>(null);
  const [layoutMap, setLayoutMap] =
    useState<Awaited<ReturnType<typeof getKeyboardLayoutMap>>>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    let active = true;

    getKeyboardLayoutMap().then((map) => {
      if (active) setLayoutMap(map);
    });

    const handleSuppressedMouseEvent = (event: MouseEvent) => {
      if (suppressedMouseButtonRef.current !== event.button) return;

      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
    };

    window.addEventListener("mouseup", handleSuppressedMouseEvent, true);
    window.addEventListener("click", handleSuppressedMouseEvent, true);
    window.addEventListener("auxclick", handleSuppressedMouseEvent, true);
    window.addEventListener("contextmenu", handleSuppressedMouseEvent, true);

    return () => {
      active = false;
      if (suppressResetTimerRef.current !== null) {
        window.clearTimeout(suppressResetTimerRef.current);
      }
      window.removeEventListener("mouseup", handleSuppressedMouseEvent, true);
      window.removeEventListener("click", handleSuppressedMouseEvent, true);
      window.removeEventListener("auxclick", handleSuppressedMouseEvent, true);
      window.removeEventListener(
        "contextmenu",
        handleSuppressedMouseEvent,
        true,
      );
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

    const finishCapture = (nextHotkey?: string) => {
      if (nextHotkey !== undefined) {
        onChangeRef.current(nextHotkey);
      }
      setListening(false);
      inputRef.current?.blur();
    };

    let pendingModifierHotkey: string | null = null;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const modifierHotkey = captureModifierHotkey(event);
      if (modifierHotkey) {
        pendingModifierHotkey = modifierHotkey;
        return;
      }

      if (event.key === "Escape" || event.code === "Escape") {
        pendingModifierHotkey = null;
        finishCapture("escape");
        return;
      }

      if (event.key === "Backspace") {
        pendingModifierHotkey = null;
        finishCapture("backspace");
        return;
      }

      if (event.key === "Delete") {
        pendingModifierHotkey = null;
        finishCapture("delete");
        return;
      }

      pendingModifierHotkey = null;

      const nextHotkey = captureHotkey(event);
      if (!nextHotkey) return;

      finishCapture(nextHotkey);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const modifierHotkey = captureModifierHotkey(event);
      if (!modifierHotkey || modifierHotkey !== pendingModifierHotkey) return;

      pendingModifierHotkey = null;
      finishCapture(modifierHotkey);
    };

    const handleMouseDown = (event: MouseEvent) => {
      const input = inputRef.current;
      const isInputTarget =
        input !== null &&
        event.target instanceof Node &&
        input.contains(event.target);

      if (
        isInputTarget &&
        event.button === 0 &&
        performance.now() < ignorePrimaryInputMouseUntilRef.current
      ) {
        return;
      }

      const nextHotkey = captureMouseHotkey(event);
      if (!nextHotkey) return;

      suppressedMouseButtonRef.current = event.button;
      if (suppressResetTimerRef.current !== null) {
        window.clearTimeout(suppressResetTimerRef.current);
      }
      suppressResetTimerRef.current = window.setTimeout(() => {
        suppressedMouseButtonRef.current = null;
        suppressResetTimerRef.current = null;
      }, 200);

      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();

      finishCapture(nextHotkey);
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("mousedown", handleMouseDown, true);
    window.addEventListener("contextmenu", handleContextMenu, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("mousedown", handleMouseDown, true);
      window.removeEventListener("contextmenu", handleContextMenu, true);
    };
  }, [listening]);

  const displayText = useMemo(() => {
    if (listening) return "Press keys\u2026";

    return value
      ? formatHotkeyForDisplay(value, layoutMap, defaultHotkeyLabels)
      : defaultHotkeyLabels.empty;
  }, [layoutMap, listening, value]);

  const hasConflict = conflicts !== undefined && conflicts.length > 0;
  const stateClass = getStateClass(listening, hasConflict, !!value);

  const tooltipText = listening
    ? undefined
    : hasConflict
      ? `Already bound to: ${conflicts!.join(", ")}`
      : reserved
        ? "This hotkey may conflict with system shortcuts"
        : value
          ? "Hotkey works even when Blur is minimized"
          : undefined;

  return (
    <div className={`hk-wrapper ${stateClass}`}>
      <button
        ref={inputRef}
        type="button"
        className={`${className} hk-button`}
        style={{
          ...style,
          paddingRight: value && !listening ? "1.25rem" : undefined,
        }}
        onClick={() => {
          ignorePrimaryInputMouseUntilRef.current = performance.now() + 150;
          setListening(true);
          invoke("stop_clicker").catch((err) => {
            console.error("Failed to stop clicker:", err);
          });
        }}
        onBlur={() => {
          if (listening) {
            setListening(false);
          }
        }}
        title={tooltipText}
      >
        {displayText}
      </button>
      {value && !listening && (
        <button
          type="button"
          className="hk-clear-btn"
          onClick={(e) => {
            e.stopPropagation();
            onChange("");
          }}
          title="Clear hotkey"
        >
          ×
        </button>
      )}
    </div>
  );
}
