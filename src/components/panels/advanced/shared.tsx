import {
  type CSSProperties,
  type ChangeEvent,
  type FocusEvent,
  type WheelEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "../../../i18n";
import { normalizeIntegerRaw } from "../../../numberInput";
import UnavailableReason from "../../UnavailableReason";

// ToggleBtn ← These are here just for some visual space

export function ToggleBtn({
  value,
  onChange,
  disabled = false,
  disabledReason,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (disabled && value) {
      onChange(false);
    }
  }, [disabled, value, onChange]);

  const group = (
    <div className="adv-toggle-group">
      <button
        className={`adv-toggle-btn adv-toggle-off ${!value ? "active" : ""} ${disabled ? "adv-disabled" : ""}`}
        onClick={() => !disabled && onChange(false)}
        disabled={disabled}
      >
        {t("common.off")}
      </button>
      <button
        className={`adv-toggle-btn adv-toggle-on ${value ? "active" : ""} ${disabled ? "adv-disabled" : ""}`}
        onClick={() => !disabled && onChange(true)}
        disabled={disabled}
      >
        {t("common.on")}
      </button>
    </div>
  );

  return disabled ? (
    <UnavailableReason reason={disabledReason}>{group}</UnavailableReason>
  ) : (
    group
  );
}

// Disableable

export function Disableable({
  enabled,
  disabledReason,
  children,
}: {
  enabled: boolean;
  disabledReason?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  const content = (
    <div className="adv-disabled-container">
      <div className={enabled ? "" : "adv-disabled-content"}>{children}</div>
      {!enabled && (
        <div className="adv-disabled-overlay">
          <span className="adv-disabled-label">{t("common.disabled")}</span>
        </div>
      )}
    </div>
  );

  return enabled ? (
    content
  ) : (
    <UnavailableReason
      reason={disabledReason}
      className="unavailable-reason--block"
    >
      {content}
    </UnavailableReason>
  );
}

// NumInput

export function NumInput({
  value,
  onChange,
  min,
  max,
  style,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const clampValue = (next: number) => {
    let clamped = next;
    if (min !== undefined && clamped < min) clamped = min;
    if (max !== undefined && clamped > max) clamped = max;
    return clamped;
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = normalizeIntegerRaw(e.target.value);
    if (raw !== e.target.value) {
      e.target.value = raw;
    }
    const val = raw === "" || raw === "-" ? 0 : Number(raw);
    onChange(val);
  };

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    const raw = normalizeIntegerRaw(e.target.value);
    if (raw !== e.target.value) {
      e.target.value = raw;
    }
    let val = Number(raw || e.target.value);
    if (Number.isNaN(val)) val = min ?? 0;
    onChange(clampValue(val));
  };

  const handleWheel = (e: WheelEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const direction = e.deltaY < 0 ? 1 : -1;
    const current = Number.isFinite(value) ? value : min ?? 0;
    onChange(clampValue(current + direction));
  };

  return (
    <input
      ref={ref}
      type="number"
      className="adv-number-sm"
      value={value}
      min={min}
      max={max}
      onChange={handleChange}
      onBlur={handleBlur}
      onWheelCapture={handleWheel}
      onWheel={handleWheel}
      style={{
        background: "transparent",
        border: "none",
        outline: "none",
        width: "36px",
        ...style,
      }}
    />
  );
}

// CardDivider

export function CardDivider() {
  return <div className="adv-card-divider" />;
}

// InfoIcon

export function InfoIcon({ text }: { text: string }) {
  const iconRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [placement, setPlacement] = useState<"above" | "below">("above");
  const [position, setPosition] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  });

  const updateTooltipPosition = useCallback(() => {
    const icon = iconRef.current;
    if (!icon) {
      return;
    }

    const rect = icon.getBoundingClientRect();
    const tooltipWidth = tooltipRef.current?.offsetWidth ?? 220;
    const tooltipHeight = tooltipRef.current?.offsetHeight ?? 80;
    const spacing = 8;
    const viewportPadding = 8;

    const maxLeft = Math.max(
      viewportPadding,
      window.innerWidth - tooltipWidth - viewportPadding,
    );
    const left = Math.max(viewportPadding, Math.min(rect.left, maxLeft));

    const fitsAbove = rect.top - spacing - tooltipHeight >= viewportPadding;
    const fitsBelow =
      rect.bottom + spacing + tooltipHeight <=
      window.innerHeight - viewportPadding;
    const nextPlacement = fitsAbove || !fitsBelow ? "above" : "below";
    const top =
      nextPlacement === "above" ? rect.top - spacing : rect.bottom + spacing;

    setPlacement(nextPlacement);
    setPosition({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (!visible) {
      return;
    }

    const id = window.requestAnimationFrame(updateTooltipPosition);

    const handleReposition = () => {
      updateTooltipPosition();
    };

    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [visible, updateTooltipPosition]);

  return (
    <span
      ref={iconRef}
      className="adv-info-icon"
      tabIndex={0}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setVisible(false);
        }
      }}
      aria-label={text}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          cx="8"
          cy="8"
          r="6.5"
          stroke="currentColor"
          strokeWidth="1.25"
        />
        <circle cx="8" cy="4.75" r="0.75" fill="currentColor" />
        <line
          x1="8"
          y1="7"
          x2="8"
          y2="11.5"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
      {visible &&
        createPortal(
          <span
            ref={tooltipRef}
            className="adv-info-tooltip adv-info-tooltip--portal"
            data-placement={placement}
            role="tooltip"
            style={
              {
                left: `${position.left}px`,
                top: `${position.top}px`,
                transform: placement === "above" ? "translateY(-100%)" : "none",
              } as CSSProperties
            }
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}

// DropDown

export function AdvDropdown({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const toggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(!open);
  };

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const activeLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <div className="adv-dropdown" ref={ref}>
      <button
        type="button"
        className="adv-dropdown-trigger"
        onClick={toggle}
      >
        <span>{activeLabel}</span>
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          style={{ marginLeft: 4, flexShrink: 0 }}
        >
          <path
            d="M1 1L5 5L9 1"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div
          className="adv-dropdown-menu"
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`adv-dropdown-item ${option.value === value ? "active" : ""}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}