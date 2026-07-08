import {
  type CSSProperties,
  type ChangeEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
import type { MouseButton, Settings } from "../../store";

import CadenceInput from "../CadenceInput";
import HotkeyCaptureInput from "../HotkeyCaptureInput";
import { MODE_OPTIONS, SETTINGS_LIMITS } from "../../settingsSchema";
import { isAlphabeticKeyboardKey } from "../../keyboardKeyCase";
import { conflictsWithAutoPressKey } from "../../hotkeys";
import KeyCaptureInput from "../KeyCaptureInput";
import { AdvDropdown } from "./advanced/sections/shared";
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
  let step = 1;
  if (event.shiftKey && event.ctrlKey) step = 100;
  else if (event.ctrlKey) step = 25;
  else if (event.shiftKey) step = 5;
  apply(clamp(current + delta * step, min, max));
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

function SimplePanel({ settings, update }: SimplePanelProps) {
  const clickModeOptions = MODE_OPTIONS.map((mode) => ({
    value: mode,
    label: mode === "Toggle" ? "Toggle" : "Hold",
  }));

  const canToggleKeyboardKeyCase = isAlphabeticKeyboardKey(
    settings.keyboardKey,
  );
  const keyboardKeyCaseIsUpper = settings.keyboardKeyCase === "upper";
  const keyboardKeyCaseLabel = keyboardKeyCaseIsUpper ? "↑" : "↓";
  const toggleKeyboardKeyCase = () => {
    if (!canToggleKeyboardKeyCase) return;
    update({
      keyboardKeyCase: keyboardKeyCaseIsUpper ? "lower" : "upper",
    });
  };

  const hasConflict =
    settings.inputType === "keyboard" &&
    conflictsWithAutoPressKey(
      settings.hotkey,
      settings.keyboardKey,
      keyboardKeyCaseIsUpper,
    );
  const hotkeyConflicts = hasConflict ? ["Auto-press key"] : [];
  const autoPressKeyConflicts = hasConflict ? ["Hotkey"] : [];

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
              style={{ width: "90px" }}
              value={settings.hotkey}
              onChange={(hotkey) => update({ hotkey })}
              conflicts={hotkeyConflicts}
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
          <div className="simple-input-type-group">
            <button
              type="button"
              className={`simple-input-type-btn ${settings.inputType === "mouse" ? "active" : ""}`}
              onClick={() => update({ inputType: "mouse" })}
              title="Mouse"
              aria-label="Mouse"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a7 7 0 0 0-7 7v6a7 7 0 0 0 14 0V9a7 7 0 0 0-7-7z" />
                <path d="M12 2v9" />
                <circle
                  cx="12"
                  cy="14"
                  r="1"
                  fill="currentColor"
                  stroke="none"
                />
              </svg>
            </button>
            <button
              type="button"
              className={`simple-input-type-btn ${settings.inputType === "keyboard" ? "active" : ""}`}
              onClick={() => update({ inputType: "keyboard" })}
              title="Keyboard"
              aria-label="Keyboard"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
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
            </button>
          </div>
          <div className="vertical-devider vertical-devider--stretch" />
          {settings.inputType === "mouse" ? (
            <div className="simple-mouse-btn-group">
              {(["Left", "Middle", "Right"] as const).map((btn) => (
                <button
                  key={btn}
                  type="button"
                  className={`simple-mouse-btn ${settings.mouseButton === btn ? "active" : ""}`}
                  onClick={() => update({ mouseButton: btn as MouseButton })}
                >
                  {btn}
                </button>
              ))}
            </div>
          ) : (
            <>
              <KeyCaptureInput
                className="simple-hotkey-input"
                value={settings.keyboardKey}
                onChange={(key) => update({ keyboardKey: key })}
                keyboardKeyCase={settings.keyboardKeyCase}
                onMouseButtonCapture={(mouseButton) =>
                  update({ inputType: "mouse", mouseButton })
                }
                style={{ width: "90px", flexShrink: 0 }}
                conflicts={autoPressKeyConflicts}
              />
              <button
                type="button"
                className={`simple-key-case-toggle ${
                  keyboardKeyCaseIsUpper
                    ? "simple-key-case-toggle--upper"
                    : "simple-key-case-toggle--lower"
                }`}
                aria-label={
                  keyboardKeyCaseIsUpper
                    ? "Send letters as uppercase"
                    : "Send letters as lowercase"
                }
                aria-pressed={keyboardKeyCaseIsUpper}
                title="Toggle keyboard key case"
                disabled={!canToggleKeyboardKeyCase}
                onClick={toggleKeyboardKeyCase}
              >
                {keyboardKeyCaseLabel}
              </button>
            </>
          )}
        </ControlBox>

        <ControlBox className="simple-row-item">
          <NumberField
            label="Duty Cycle"
            value={settings.dutyCycle}
            min={SETTINGS_LIMITS.dutyCycle.min!}
            max={SETTINGS_LIMITS.dutyCycle.max!}
            onChange={(next) => update({ dutyCycle: next })}
            width={dynamicChWidth(settings.dutyCycle)}
          />
        </ControlBox>

        <ControlBox className="simple-row-item">
          <NumberField
            label="Speed Randomization"
            value={settings.speedRandomization}
            min={SETTINGS_LIMITS.speedRandomization.min!}
            max={SETTINGS_LIMITS.speedRandomization.max!}
            onChange={(next) => update({ speedRandomization: next })}
            width={dynamicChWidth(settings.speedRandomization)}
          />
        </ControlBox>
      </div>
    </div>
  );
}

export default SimplePanel;
