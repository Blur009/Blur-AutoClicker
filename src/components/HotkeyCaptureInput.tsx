import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  captureHotkey,
  captureMouseHotkey,
  formatHotkeyForDisplay,
  getKeyboardLayoutMap,
  type HotkeyDisplayLabels,
} from "../hotkeys";
import { useTranslation, type TranslationKey } from "../i18n";

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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ignorePrimaryInputMouseUntilRef = useRef(0);
  const suppressedMouseButtonRef = useRef<number | null>(null);
  const suppressResetTimerRef = useRef<number | null>(null);
  const [layoutMap, setLayoutMap] =
    useState<Awaited<ReturnType<typeof getKeyboardLayoutMap>>>(null);
  const { t } = useTranslation();

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
    return () => {
      if (suppressResetTimerRef.current !== null) {
        window.clearTimeout(suppressResetTimerRef.current);
      }
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
      window.removeEventListener("mouseup", handleSuppressedMouseEvent, true);
      window.removeEventListener("click", handleSuppressedMouseEvent, true);
      window.removeEventListener("auxclick", handleSuppressedMouseEvent, true);
      window.removeEventListener("contextmenu", handleSuppressedMouseEvent, true);
    };
  }, []);

  useEffect(() => {
    if (!listening) return;

    const finishCapture = (nextHotkey?: string) => {
      if (nextHotkey !== undefined) {
        onChange(nextHotkey);
      }
      setListening(false);
      inputRef.current?.blur();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        finishCapture();
        return;
      }

      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.metaKey
      ) {
        finishCapture("");
        return;
      }

      const nextHotkey = captureHotkey(event);
      if (!nextHotkey) return;

      finishCapture(nextHotkey);
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

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("mousedown", handleMouseDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("mousedown", handleMouseDown, true);
    };
  }, [listening, onChange]);

  const hotkeyLabels = useMemo<HotkeyDisplayLabels>(() => {
    const keyCodes = [
      "up",
      "down",
      "left",
      "right",
      "pageup",
      "pagedown",
      "backspace",
      "delete",
      "insert",
      "home",
      "end",
      "enter",
      "tab",
      "space",
      "escape",
      "esc",
      "capslock",
      "numlock",
      "scrolllock",
      "printscreen",
      "pause",
      "menu",
      "mouseleft",
      "mouseright",
      "mousemiddle",
      "mouse4",
      "mouse5",
      "numpad0",
      "numpad1",
      "numpad2",
      "numpad3",
      "numpad4",
      "numpad5",
      "numpad6",
      "numpad7",
      "numpad8",
      "numpad9",
      "numpadadd",
      "numpadsubtract",
      "numpadmultiply",
      "numpaddivide",
      "numpaddecimal",
    ] as const;

    return {
      empty: t("hotkey.empty"),
      modifiers: {
        ctrl: t("hotkey.modifier.ctrl"),
        alt: t("hotkey.modifier.alt"),
        shift: t("hotkey.modifier.shift"),
        super: t("hotkey.modifier.super"),
      },
      keys: Object.fromEntries(
        keyCodes.map((code) => [code, t(`hotkey.key.${code}` as TranslationKey)]),
      ),
    };
  }, [t]);

  const displayText = useMemo(
    () =>
      listening
        ? t("hotkey.pressKeys")
        : formatHotkeyForDisplay(value, layoutMap, hotkeyLabels),
    [hotkeyLabels, layoutMap, listening, t, value],
  );

  return (
    <input
      ref={inputRef}
      type="text"
      className={className}
      value={displayText}
      readOnly
      onMouseDown={(event) => {
        if (event.button === 0) {
          ignorePrimaryInputMouseUntilRef.current = performance.now() + 150;
        }
      }}
      onFocus={() => setListening(true)}
      onBlur={() => setListening(false)}
      onContextMenu={(event) => {
        if (listening) {
          event.preventDefault();
        }
      }}
      spellCheck={false}
      style={style}
    />
  );
}
