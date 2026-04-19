import {
  type ChangeEvent,
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { useTranslation } from "../../../i18n";
import { normalizeIntegerRaw } from "../../../numberInput";
import UnavailableReason from "../../UnavailableReason";

// ToggleBtn

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
        className={`adv-toggle-btn ${!value ? "active" : ""} ${disabled ? "adv-disabled" : ""}`}
        onClick={() => !disabled && onChange(false)}
        disabled={disabled}
      >
        {t("common.off")}
      </button>
      <button
        className={`adv-toggle-btn ${value ? "active" : ""} ${disabled ? "adv-disabled" : ""}`}
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
    if (min !== undefined && val < min) val = min;
    if (max !== undefined && val > max) val = max;
    onChange(val);
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

export function CardDivider() {
  return <div className="adv-card-divider" />;
}