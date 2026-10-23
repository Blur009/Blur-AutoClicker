import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  hexToRgb,
  hsvToRgb,
  isValidHex,
  normalizeHex,
  rgbToHex,
  rgbToHsv,
  type HsvColor,
} from "../colorMath";
import "./ColorPicker.css";

const POPOVER_GAP = 6;
const VIEWPORT_MARGIN = 8;
const FALLBACK_RGB = { red: 0, green: 0, blue: 0 };

interface Props {
  value: string;
  onChange: (value: string) => void;
  onPreview?: (value: string) => void;
  label: string;
}

type DragTarget = "saturation-value" | "hue";

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function rectIsMeasurable(rect: DOMRect): boolean {
  return (
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function saturationValueFromPointer(
  rect: DOMRect,
  clientX: number,
  clientY: number,
): { saturation: number; value: number } | null {
  if (!rectIsMeasurable(rect)) return null;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  return {
    saturation: clampNumber((clientX - rect.left) / rect.width, 0, 1),
    value: clampNumber(1 - (clientY - rect.top) / rect.height, 0, 1),
  };
}

function hueFromPointer(rect: DOMRect, clientY: number): number | null {
  if (!rectIsMeasurable(rect) || !Number.isFinite(clientY)) return null;
  return clampNumber(((clientY - rect.top) / rect.height) * 360, 0, 359.99);
}

export default function ColorPicker({
  value,
  onChange,
  onPreview,
  label,
}: Props) {
  const currentHex = normalizeHex(value) || "#000000";
  const [color, setColor] = useState(() => ({
    hex: currentHex,
    hsv: rgbToHsv(hexToRgb(currentHex) ?? FALLBACK_RGB),
  }));
  const [lastPropHex, setLastPropHex] = useState(currentHex);
  if (currentHex !== lastPropHex) {
    setLastPropHex(currentHex);
    if (currentHex !== color.hex) {
      const rgb = hexToRgb(currentHex);
      if (rgb) setColor({ hex: currentHex, hsv: rgbToHsv(rgb) });
    }
  }
  const hsv = color.hsv;

  const [open, setOpen] = useState(false);
  const [positioned, setPositioned] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [hexDraft, setHexDraft] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const svAreaRef = useRef<HTMLDivElement | null>(null);
  const hueBarRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragTarget | null>(null);
  const dragRectRef = useRef<DOMRect | null>(null);
  const onChangeRef = useRef(onChange);
  const onPreviewRef = useRef(onPreview);
  const pendingHexRef = useRef<string | null>(null);
  const currentHexRef = useRef(currentHex);
  const previewFrameRef = useRef<number | null>(null);
  const previewHexRef = useRef<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
    onPreviewRef.current = onPreview;
  });

  useLayoutEffect(() => {
    currentHexRef.current = currentHex;
    pendingHexRef.current = null;
  }, [currentHex]);

  const flushPreview = useCallback(() => {
    if (previewFrameRef.current !== null) {
      cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
    const hex = previewHexRef.current;
    previewHexRef.current = null;
    if (hex !== null) onPreviewRef.current?.(hex);
  }, []);

  const previewColor = useCallback((hex: string) => {
    if (!onPreviewRef.current) return;
    previewHexRef.current = hex;
    if (previewFrameRef.current !== null) return;
    previewFrameRef.current = requestAnimationFrame(() => {
      previewFrameRef.current = null;
      const next = previewHexRef.current;
      previewHexRef.current = null;
      if (next !== null) onPreviewRef.current?.(next);
    });
  }, []);

  const commitPendingColor = useCallback(() => {
    flushPreview();
    const pending = pendingHexRef.current;
    if (pending === null) return;
    pendingHexRef.current = null;
    if (pending === currentHex) return;
    onChangeRef.current(pending);
  }, [flushPreview, currentHex]);

  const applyColor = useCallback(
    (hex: string, next: HsvColor) => {
      setColor({ hex, hsv: next });
      pendingHexRef.current = null;
      previewColor(hex);
      if (hex !== currentHex) onChangeRef.current(hex);
    },
    [currentHex, previewColor],
  );

  const commitHsv = useCallback(
    (next: HsvColor) => applyColor(rgbToHex(hsvToRgb(next)), next),
    [applyColor],
  );

  const previewHsv = useCallback(
    (next: HsvColor) => {
      const hex = rgbToHex(hsvToRgb(next));
      setColor({ hex, hsv: next });
      pendingHexRef.current = hex;
      previewColor(hex);
    },
    [previewColor],
  );

  const closePopover = useCallback(
    (restoreFocus: boolean) => {
      dragRef.current = null;
      dragRectRef.current = null;
      commitPendingColor();
      setHexDraft(null);
      setOpen(false);
      if (restoreFocus) triggerRef.current?.focus();
    },
    [commitPendingColor],
  );

  useEffect(() => {
    return () => {
      if (previewFrameRef.current !== null) {
        cancelAnimationFrame(previewFrameRef.current);
      }
      const pending = pendingHexRef.current;
      if (pending !== null && pending !== currentHexRef.current) {
        onChangeRef.current(pending);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      if (dragRef.current) return;
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) return;

      const triggerRect = trigger.getBoundingClientRect();
      const width = popover.offsetWidth;
      const height = popover.offsetHeight;
      const spaceBelow = window.innerHeight - triggerRect.bottom - POPOVER_GAP;
      const spaceAbove = triggerRect.top - POPOVER_GAP;
      const placeAbove = spaceBelow < height && spaceAbove > spaceBelow;
      const top = clampNumber(
        placeAbove
          ? triggerRect.top - POPOVER_GAP - height
          : triggerRect.bottom + POPOVER_GAP,
        VIEWPORT_MARGIN,
        window.innerHeight - VIEWPORT_MARGIN - height,
      );
      const left = clampNumber(
        triggerRect.right - width,
        VIEWPORT_MARGIN,
        window.innerWidth - VIEWPORT_MARGIN - width,
      );

      setPosition((previous) =>
        previous.left === left && previous.top === top
          ? previous
          : { left, top },
      );
      setPositioned(true);
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      closePopover(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closePopover(true);
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, closePopover]);

  const toggleOpen = useCallback(() => {
    if (open) {
      closePopover(false);
      return;
    }
    setPositioned(false);
    setOpen(true);
  }, [open, closePopover]);

  const applySaturationValue = useCallback(
    (clientX: number, clientY: number) => {
      const rect = dragRectRef.current;
      if (!rect) return;
      const next = saturationValueFromPointer(rect, clientX, clientY);
      if (!next) return;
      previewHsv({ ...hsv, ...next });
    },
    [hsv, previewHsv],
  );

  const applyHue = useCallback(
    (clientY: number) => {
      const rect = dragRectRef.current;
      if (!rect) return;
      const hue = hueFromPointer(rect, clientY);
      if (hue === null) return;
      previewHsv({ ...hsv, hue });
    },
    [hsv, previewHsv],
  );

  const beginDrag = useCallback(
    (target: DragTarget, event: ReactPointerEvent<HTMLDivElement>) => {
      dragRef.current = target;
      dragRectRef.current = event.currentTarget.getBoundingClientRect();
      if (typeof event.currentTarget.setPointerCapture === "function") {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      if (target === "saturation-value") {
        applySaturationValue(event.clientX, event.clientY);
      } else {
        applyHue(event.clientY);
      }
    },
    [applyHue, applySaturationValue],
  );

  const endDrag = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    dragRectRef.current = null;
    commitPendingColor();
  }, [commitPendingColor]);

  const handleDragMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      if (event.buttons === 0) {
        endDrag();
        return;
      }
      if (dragRef.current === "saturation-value") {
        applySaturationValue(event.clientX, event.clientY);
      } else {
        applyHue(event.clientY);
      }
    },
    [applyHue, applySaturationValue, endDrag],
  );

  const handleSaturationValueKey = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 0.1 : 0.01;
      let saturation = hsv.saturation;
      let value = hsv.value;
      if (event.key === "ArrowUp") value = clampNumber(value + step, 0, 1);
      else if (event.key === "ArrowDown") {
        value = clampNumber(value - step, 0, 1);
      } else if (event.key === "ArrowRight") {
        saturation = clampNumber(saturation + step, 0, 1);
      } else if (event.key === "ArrowLeft") {
        saturation = clampNumber(saturation - step, 0, 1);
      } else return;
      event.preventDefault();
      commitHsv({ hue: hsv.hue, saturation, value });
    },
    [commitHsv, hsv],
  );

  const handleHueKey = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 10 : 1;
      let hue = hsv.hue;
      if (event.key === "ArrowUp") hue = (hue + step) % 360;
      else if (event.key === "ArrowDown") hue = (hue - step + 360) % 360;
      else return;
      event.preventDefault();
      commitHsv({ ...hsv, hue });
    },
    [commitHsv, hsv],
  );

  const handleHexChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const draft = event.target.value;
      setHexDraft(draft);
      const normalized = normalizeHex(draft);
      if (!normalized) return;
      const rgb = hexToRgb(normalized);
      if (!rgb) return;
      applyColor(normalized, rgbToHsv(rgb));
    },
    [applyColor],
  );

  const handleHexBlur = useCallback(() => {
    setHexDraft(null);
  }, []);

  const saturationValueStyle = useMemo<CSSProperties>(
    () => ({
      left: `${(hsv.saturation * 100).toFixed(3)}%`,
      top: `${((1 - hsv.value) * 100).toFixed(3)}%`,
    }),
    [hsv.saturation, hsv.value],
  );

  const hueStyle = useMemo<CSSProperties>(
    () => ({ top: `${((hsv.hue / 360) * 100).toFixed(3)}%` }),
    [hsv.hue],
  );

  const saturationValueBackdrop = useMemo<CSSProperties>(
    () => ({ backgroundColor: `hsl(${hsv.hue}, 100%, 50%)` }),
    [hsv.hue],
  );

  const hexValue = hexDraft ?? color.hex.toUpperCase();
  const hexDraftValid = hexDraft === null || isValidHex(hexDraft);

  return (
    <div className="color-picker">
      <button
        ref={triggerRef}
        type="button"
        className="color-picker-trigger"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggleOpen}
      >
        <span
          className="color-picker-swatch"
          style={{ backgroundColor: color.hex }}
        />
      </button>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="color-picker-popover"
            role="dialog"
            aria-label={label}
            style={{
              left: `${position.left}px`,
              top: `${position.top}px`,
              visibility: positioned ? "visible" : "hidden",
            }}
          >
            <div
              ref={svAreaRef}
              className="color-picker-sv"
              role="slider"
              aria-label="Saturation and brightness"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(hsv.saturation * 50 + hsv.value * 50)}
              tabIndex={0}
              style={saturationValueBackdrop}
              onPointerDown={(event) => beginDrag("saturation-value", event)}
              onPointerMove={handleDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onLostPointerCapture={endDrag}
              onKeyDown={handleSaturationValueKey}
            >
              <span
                className="color-picker-sv-handle"
                style={saturationValueStyle}
              />
            </div>
            <div
              ref={hueBarRef}
              className="color-picker-hue"
              role="slider"
              aria-label="Hue"
              aria-valuemin={0}
              aria-valuemax={360}
              aria-valuenow={Math.round(hsv.hue)}
              tabIndex={0}
              onPointerDown={(event) => beginDrag("hue", event)}
              onPointerMove={handleDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onLostPointerCapture={endDrag}
              onKeyDown={handleHueKey}
            >
              <span className="color-picker-hue-handle" style={hueStyle} />
            </div>
            <div className="color-picker-footer">
              <span
                className="color-picker-preview"
                style={{ backgroundColor: color.hex }}
              />
              <input
                className={`color-picker-hex${hexDraftValid ? "" : " color-picker-hex--invalid"}`}
                value={hexValue}
                onChange={handleHexChange}
                onBlur={handleHexBlur}
                spellCheck={false}
                maxLength={7}
                aria-label="Hex color value"
                aria-invalid={!hexDraftValid}
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
