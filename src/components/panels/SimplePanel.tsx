import type { CSSProperties, ChangeEvent, ReactNode, WheelEvent } from "react";
import type { MouseButton, Settings } from "../../store";
import { useTranslation, type TranslationKey } from "../../i18n";
import CadenceInput from "../CadenceInput";
import HotkeyCaptureInput from "../HotkeyCaptureInput";
import {
  MODE_OPTIONS,
  MOUSE_BUTTON_OPTIONS,
  SETTINGS_LIMITS,
} from "../../settingsSchema";
import KeyCaptureInput from "../KeyCaptureInput";
import { AdvDropdown } from "./advanced/shared";
import "./SimplePanel.css";

interface SimplePanelProps {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

function normalizeRaw(raw: string) {
  return raw.replace(/^0+(?=\d)/, "");
}

function parseRawNumber(raw: string) {
  const normalized = normalizeRaw(raw);
  return normalized === "" ? 0 : Number(normalized);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function dynamicChWidth(value: number, min = 1, max = 3) {
  return `${clamp(String(value).length, min, max)}ch`;
}

function handleWheelStep(
  event: WheelEvent<HTMLInputElement>,
  current: number,
  min: number,
  max: number,
  apply: (next: number) => void,
) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.blur();
  const delta = event.deltaY < 0 ? 1 : -1;
  apply(clamp(current + delta, min, max));
}

function ControlBox({
  className,
  children,
  style,
}: {
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`InputBox simple-control-box ${className ?? ""}`.trim()}
      style={style}
    >
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  width,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  width: string;
}) {
  return (
    <>
      <span className="simple-control-label">{label}</span>
      <div className="vertical-devider vertical-devider--stretch" />
      <input
        type="number"
        title={label}
        aria-label={label}
        className="simple-inline-input simple-number-input"
        style={{
          width,
          minWidth: "1ch",
        }}
        value={value}
        min={min}
        max={max}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const normalized = normalizeRaw(event.target.value);
          if (normalized !== event.target.value) {
            event.target.value = normalized;
          }
          onChange(parseRawNumber(normalized));
        }}
        onBlur={(event) => {
          const normalized = normalizeRaw(event.target.value);
          if (normalized !== event.target.value) {
            event.target.value = normalized;
          }
          onChange(clamp(parseRawNumber(normalized), min, max));
        }}
        onWheel={(event) =>
          handleWheelStep(event, value, min, max, (next) => onChange(next))
        }
      />
      <div className="postfix">%</div>
    </>
  );
}

export default function SimplePanel({ settings, update }: SimplePanelProps) {
  const { t } = useTranslation();

  const isShortHotkey = (() => {
    const raw = settings.hotkey.trim();
    if (!raw) return true;
    const parts = raw.split("+").filter(Boolean);
    return parts.length <= 2 && raw.length <= 10;
  })();

  const clickModeOptions = MODE_OPTIONS.map((mode) => ({
    value: mode,
    label: t(`options.mode.${mode}` as TranslationKey),
  }));

  const mouseButtonOptions = MOUSE_BUTTON_OPTIONS.map((button) => ({
    value: button,
    label: t(`options.mouseButton.${button}` as TranslationKey),
  }));

  const inputTypeOptions = [
    { value: "mouse", label: "Mouse" },
    { value: "keyboard", label: "Key" },
  ] as const;

  return (
    <div className="vcontainer simple-panel">
      <div className="hcontainer simple-row simple-row--top">
        <div className="simple-row-item">
          <CadenceInput settings={settings} update={update} variant="simple" />
        </div>

        <ControlBox className="simple-hotkey-box simple-row-item">
          <div className="faderbox simple-hotkey-field">
            <HotkeyCaptureInput
              className="simple-hotkey-input"
              style={{ width: isShortHotkey ? "90px" : "130px" }}
              value={settings.hotkey}
              onChange={(hotkey) => update({ hotkey })}
            />
          </div>
          <svg
            className="Icon simple-hotkey-icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="4" width="20" height="14" rx="2" />
            <line x1="6" y1="8" x2="6" y2="8" />
            <line x1="10" y1="8" x2="10" y2="8" />
            <line x1="14" y1="8" x2="14" y2="8" />
            <line x1="18" y1="8" x2="18" y2="8" />
            <line x1="8" y1="12" x2="8" y2="12" />
            <line x1="12" y1="12" x2="12" y2="12" />
            <line x1="16" y1="12" x2="16" y2="12" />
            <line x1="7" y1="16" x2="17" y2="16" />
          </svg>
          <div className="vertical-devider vertical-devider--stretch" />
          <AdvDropdown
            value={settings.mode}
            options={clickModeOptions}
            allowWindowOverflow
            onChange={(value) => update({ mode: value as Settings["mode"] })}
          />
        </ControlBox>
      </div>

      <div className="hcontainer simple-row simple-row--bottom">
        <ControlBox className="simple-input-box simple-row-item">
          <AdvDropdown
            value={settings.inputType}
            options={inputTypeOptions}
            allowWindowOverflow
            onChange={(value) =>
              update({ inputType: value as Settings["inputType"] })
            }
          />
          <div className="vertical-devider vertical-devider--stretch" />
          {settings.inputType === "mouse" ? (
            <AdvDropdown
              value={settings.mouseButton}
              options={mouseButtonOptions}
              allowWindowOverflow
              onChange={(value) => update({ mouseButton: value as MouseButton })}
            />
          ) : (
            <KeyCaptureInput
              className="simple-key-input"
              value={settings.keyboardKey}
              onChange={(key) => update({ keyboardKey: key })}
              style={{ width: "90px" }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                update({ inputType: "mouse" });
              }}
            />
          )}
        </ControlBox>

        <ControlBox className="simple-row-item">
          <NumberField
            label={t("simple.hold")}
            value={settings.dutyCycle}
            min={SETTINGS_LIMITS.dutyCycle.min}
            max={SETTINGS_LIMITS.dutyCycle.max}
            onChange={(next) => update({ dutyCycle: next })}
            width={dynamicChWidth(settings.dutyCycle)}
          />
        </ControlBox>

        <ControlBox className="simple-row-item">
          <NumberField
            label={t("simple.randomization")}
            value={settings.speedVariation}
            min={SETTINGS_LIMITS.speedVariation.min}
            max={SETTINGS_LIMITS.speedVariation.max}
            onChange={(next) => update({ speedVariation: next })}
            width={dynamicChWidth(settings.speedVariation)}
          />
        </ControlBox>
      </div>
    </div>
  );
}
