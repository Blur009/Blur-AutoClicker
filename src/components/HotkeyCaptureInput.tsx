import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { logDiagnostic } from "../diagnostics";
import {
  buildChordHotkey,
  captureHotkey,
  captureModifierHotkey,
  defaultHotkeyLabels,
  formatHotkeyForDisplay,
  getKeyboardLayoutMap,
  getMainKey,
  getStateClass,
  MAX_CHORD_MAINS,
  sortHeld,
} from "../hotkeys";

interface Props {
  value: string;
  onChange: (next: string) => void;
  className: string;
  style?: React.CSSProperties;
  conflicts?: string[];
  reserved?: boolean;
  editable?: boolean;
}

export interface HotkeyCaptureInputHandle {
  startListening: () => void;
}

const HotkeyCaptureInput = forwardRef<HotkeyCaptureInputHandle, Props>(
  function HotkeyCaptureInput(
    { value, onChange, className, style, conflicts, reserved, editable = true },
    ref,
  ) {
    const [listening, setListening] = useState(false);
    const inputRef = useRef<HTMLButtonElement | null>(null);
    const ignorePrimaryInputMouseUntilRef = useRef(0);
    const suppressedMouseButtonsRef = useRef<Set<number>>(new Set());
    const suppressResetTimerRef = useRef<number | null>(null);
    const [layoutMap, setLayoutMap] =
      useState<Awaited<ReturnType<typeof getKeyboardLayoutMap>>>(null);
    const onChangeRef = useRef(onChange);

    useImperativeHandle(ref, () => ({
      startListening() {
        ignorePrimaryInputMouseUntilRef.current = performance.now() + 150;
        setListening(true);
        inputRef.current?.focus();
        invoke("stop_clicker").catch((err) => {
          logDiagnostic("HotkeyCaptureInput.startListening", {
            error: String(err),
          });
        });
      },
    }));

    useEffect(() => {
      onChangeRef.current = onChange;
    });

    useEffect(() => {
      let active = true;

      getKeyboardLayoutMap().then((map) => {
        if (active) setLayoutMap(map);
      });

      const handleSuppressedMouseEvent = (event: MouseEvent) => {
        if (!suppressedMouseButtonsRef.current.has(event.button)) return;

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
        window.removeEventListener(
          "auxclick",
          handleSuppressedMouseEvent,
          true,
        );
        window.removeEventListener(
          "contextmenu",
          handleSuppressedMouseEvent,
          true,
        );
      };
    }, []);

    useEffect(() => {
      if (!listening) return;

      invoke("set_hotkey_capture_active", { active: true }).catch((err) => {
        logDiagnostic("HotkeyCaptureInput.toggle", {
          error: String(err),
        });
      });

      return () => {
        invoke("set_hotkey_capture_active", { active: false }).catch((err) => {
          logDiagnostic("HotkeyCaptureInput.clear", {
            error: String(err),
          });
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

      const heldModifiers: string[] = [];
      const capturedModifiers: string[] = [];
      const heldMains = new Set<string>();
      let chordMaxSeen = new Set<string>();
      let chordTimer: number | null = null;
      const CHORD_WINDOW_MS = 600;

      const mouseButtonToToken: Record<number, string> = {
        0: "mouseleft",
        1: "mousemiddle",
        2: "mouseright",
        3: "mouse4",
        4: "mouse5",
      };

      const suppressButtons = (buttons: number[]) => {
        for (const b of buttons) suppressedMouseButtonsRef.current.add(b);
        if (suppressResetTimerRef.current !== null) {
          window.clearTimeout(suppressResetTimerRef.current);
        }
        suppressResetTimerRef.current = window.setTimeout(() => {
          suppressedMouseButtonsRef.current.clear();
          suppressResetTimerRef.current = null;
        }, 200);
      };

      const clearChordTimer = () => {
        if (chordTimer !== null) {
          window.clearTimeout(chordTimer);
          chordTimer = null;
        }
      };

      const flushChord = () => {
        const toFlush =
          chordMaxSeen.size > 0 ? [...chordMaxSeen] : [...heldMains];
        if (toFlush.length === 0) return;
        const chord = buildChordHotkey(toFlush, heldModifiers);
        if (chord) {
          heldMains.clear();
          chordMaxSeen.clear();
          heldModifiers.length = 0;
          capturedModifiers.length = 0;
          clearChordTimer();
          finishCapture(chord);
        }
      };

      const tryAddMain = (token: string, buttonsForSuppress: number[]) => {
        if (heldMains.has(token)) return;
        if (heldMains.size >= MAX_CHORD_MAINS) {
          return;
        }
        heldMains.add(token);
        if (heldMains.size > chordMaxSeen.size) {
          chordMaxSeen = new Set(heldMains);
        }
        if (buttonsForSuppress.length) suppressButtons(buttonsForSuppress);

        if (heldMains.size === 1) {
          clearChordTimer();
          chordTimer = window.setTimeout(() => {
            chordTimer = null;
            flushChord();
          }, CHORD_WINDOW_MS);
          return;
        }

        if (heldMains.size === MAX_CHORD_MAINS) {
          // chord full -> immediate flush
          clearChordTimer();
          flushChord();
          return;
        }

        // size 2..MAX-1: restart timer to allow more keys for larger chord
        clearChordTimer();
        chordTimer = window.setTimeout(() => {
          chordTimer = null;
          flushChord();
        }, CHORD_WINDOW_MS);
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        event.preventDefault();
        event.stopPropagation();

        const modifierHotkey = captureModifierHotkey(event);
        if (modifierHotkey) {
          if (!heldModifiers.includes(modifierHotkey))
            heldModifiers.push(modifierHotkey);
          if (!capturedModifiers.includes(modifierHotkey))
            capturedModifiers.push(modifierHotkey);
          return;
        }

        if (event.key === "Escape" || event.code === "Escape") {
          heldModifiers.length = 0;
          capturedModifiers.length = 0;
          heldMains.clear();
          chordMaxSeen.clear();
          clearChordTimer();
          finishCapture("escape");
          return;
        }

        if (event.key === "Backspace") {
          heldModifiers.length = 0;
          capturedModifiers.length = 0;
          heldMains.clear();
          chordMaxSeen.clear();
          clearChordTimer();
          finishCapture("backspace");
          return;
        }

        if (event.key === "Delete") {
          heldModifiers.length = 0;
          capturedModifiers.length = 0;
          heldMains.clear();
          chordMaxSeen.clear();
          clearChordTimer();
          finishCapture("delete");
          return;
        }

        const mainKey = getMainKey(event);
        if (mainKey) {
          tryAddMain(mainKey, []);
          return;
        }

        heldModifiers.length = 0;
        capturedModifiers.length = 0;
        heldMains.clear();
        chordMaxSeen.clear();
        clearChordTimer();

        const nextHotkey = captureHotkey(event);
        if (!nextHotkey) return;

        finishCapture(nextHotkey);
      };

      const handleKeyUp = (event: KeyboardEvent) => {
        event.preventDefault();
        event.stopPropagation();

        const modifierHotkey = captureModifierHotkey(event);
        if (modifierHotkey) {
          const idx = heldModifiers.indexOf(modifierHotkey);
          if (idx !== -1) heldModifiers.splice(idx, 1);
          if (
            heldModifiers.length === 0 &&
            capturedModifiers.length > 0 &&
            heldMains.size === 0
          ) {
            const full = sortHeld(capturedModifiers).join("+");
            capturedModifiers.length = 0;
            chordMaxSeen.clear();
            clearChordTimer();
            finishCapture(full);
          }
          return;
        }

        const mainKey = getMainKey(event);
        if (mainKey && heldMains.has(mainKey)) {
          heldMains.delete(mainKey);
          if (chordTimer !== null && heldMains.size === 0) {
            // all mains released before window expiry -> flush whatever chord was seen
            clearChordTimer();
            // if chordMaxSeen has something, flush it, else flush the released single
            if (chordMaxSeen.size > 0) {
              flushChord();
            } else {
              const chord = buildChordHotkey([mainKey], heldModifiers);
              if (chord) {
                heldModifiers.length = 0;
                capturedModifiers.length = 0;
                finishCapture(chord);
              }
            }
          }
        }
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

        const token = mouseButtonToToken[event.button];
        if (!token) return;

        if (event.cancelable) {
          event.preventDefault();
        }
        event.stopPropagation();

        // also capture quick single via tryAddMain path (handles chord)
        tryAddMain(token, [event.button]);
      };

      const handleMouseUp = (event: MouseEvent) => {
        if (suppressedMouseButtonsRef.current.has(event.button)) {
          if (event.cancelable) event.preventDefault();
          event.stopPropagation();
        }
        const token = mouseButtonToToken[event.button];
        if (token && heldMains.has(token)) {
          heldMains.delete(token);
          if (chordTimer !== null && heldMains.size === 0) {
            clearChordTimer();
            if (chordMaxSeen.size > 0) {
              flushChord();
            } else {
              const chord = buildChordHotkey([token], heldModifiers);
              if (chord) {
                heldModifiers.length = 0;
                capturedModifiers.length = 0;
                finishCapture(chord);
              }
            }
          }
        }
      };

      const handleContextMenu = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
      };

      const handleBlur = () => {
        heldModifiers.length = 0;
        capturedModifiers.length = 0;
        heldMains.clear();
        chordMaxSeen.clear();
        clearChordTimer();
      };

      window.addEventListener("keydown", handleKeyDown, true);
      window.addEventListener("keyup", handleKeyUp, true);
      window.addEventListener("mousedown", handleMouseDown, true);
      window.addEventListener("mouseup", handleMouseUp, true);
      window.addEventListener("contextmenu", handleContextMenu, true);
      window.addEventListener("blur", handleBlur);

      return () => {
        clearChordTimer();
        window.removeEventListener("keydown", handleKeyDown, true);
        window.removeEventListener("keyup", handleKeyUp, true);
        window.removeEventListener("mousedown", handleMouseDown, true);
        window.removeEventListener("mouseup", handleMouseUp, true);
        window.removeEventListener("contextmenu", handleContextMenu, true);
        window.removeEventListener("blur", handleBlur);
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
            paddingRight:
              editable && value && !listening ? "1.25rem" : undefined,
          }}
          onClick={() => {
            if (!editable) return;
            ignorePrimaryInputMouseUntilRef.current = performance.now() + 150;
            setListening(true);
            invoke("stop_clicker").catch((err) => {
              logDiagnostic("HotkeyCaptureInput.stopClicker", {
                error: String(err),
              });
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
        {editable && value && !listening && (
          <button
            type="button"
            className="hk-clear-btn"
            onClick={(e) => {
              e.stopPropagation();
              invoke("stop_clicker").catch((err) => {
                logDiagnostic("HotkeyCaptureInput.clearStopClicker", {
                  error: String(err),
                });
              });
              onChange("");
            }}
            title="Clear hotkey"
          >
            ×
          </button>
        )}
      </div>
    );
  },
);

export default HotkeyCaptureInput;
