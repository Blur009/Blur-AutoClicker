import { useCallback, useMemo, type CSSProperties } from "react";
import type { MouseButton, Settings } from "../../../../store";
import { MOUSE_BUTTON_OPTIONS } from "../../../../settingsSchema";
import { isAlphabeticKeyboardKey } from "../../../../keyboardKeyCase";
import { conflictsWithAutoPressKey } from "../../../../hotkeys";
import { getEffectiveClicksPerSecond } from "../../../../cadence";
import KeyCaptureInput from "../../../KeyCaptureInput";
import { CardDivider, ToggleBtn } from "./shared";

function formatClicksPerSecond(value: number): string {
  if (value >= 10) {
    return value.toFixed(value % 1 === 0 ? 0 : 1);
  }
  if (value >= 1) {
    return value.toFixed(2).replace(/\.?0+$/, "");
  }
  return value.toFixed(3).replace(/\.?0+$/, "");
}

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const INPUT_TYPE_OPTIONS = [
  { value: "mouse", label: "Mouse" },
  { value: "keyboard", label: "Keyboard" },
] as const;

const HOTKEY_CONFLICTS = ["Hotkey"];
const NO_CONFLICTS: string[] = [];

const HEADER_ROW_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
};

const HEADER_ICON_STYLE: CSSProperties = { color: "var(--text-dim)" };

const TARGET_ROW_STYLE: CSSProperties = {
  gap: 8,
  justifyContent: "flex-end",
};

const TARGET_LABEL_GROUP_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
  marginRight: "auto",
};

const KEY_CAPTURE_STYLE: CSSProperties = { minWidth: "6rem" };

export default function ClickerTypeSection({ settings, update }: Props) {
  const canToggleKeyboardKeyCase = isAlphabeticKeyboardKey(
    settings.keyboardKey,
  );
  const keyboardKeyCaseIsUpper = settings.keyboardKeyCase === "upper";
  const keyboardKeyCaseLabel = "↑";
  const toggleKeyboardKeyCase = useCallback(() => {
    if (!canToggleKeyboardKeyCase) return;
    update({
      keyboardKeyCase: keyboardKeyCaseIsUpper ? "lower" : "upper",
    });
  }, [canToggleKeyboardKeyCase, keyboardKeyCaseIsUpper, update]);

  const handleInputTypeSelect = useCallback(
    (value: Settings["inputType"]) => update({ inputType: value }),
    [update],
  );

  const handleDoubleClickChange = useCallback(
    (v: boolean) => update({ doubleClickEnabled: v }),
    [update],
  );

  const handleMouseButtonSelect = useCallback(
    (mouseButtonOption: string) =>
      update({ mouseButton: mouseButtonOption as MouseButton }),
    [update],
  );

  const handleKeyboardKeyChange = useCallback(
    (key: string) => update({ keyboardKey: key }),
    [update],
  );

  const handleMouseButtonCapture = useCallback(
    (mouseButton: MouseButton) => update({ inputType: "mouse", mouseButton }),
    [update],
  );

  const hasConflict =
    settings.inputType === "keyboard" &&
    conflictsWithAutoPressKey(
      settings.hotkey,
      settings.keyboardKey,
      keyboardKeyCaseIsUpper,
    );
  const autoPressKeyConflicts = hasConflict ? HOTKEY_CONFLICTS : NO_CONFLICTS;

  const currentClicksPerSecond = useMemo(
    () =>
      getEffectiveClicksPerSecond({
        clickInterval: settings.clickInterval,
        clickSpeed: settings.clickSpeed,
        rateInputMode: settings.rateInputMode,
        durationHours: settings.durationHours,
        durationMinutes: settings.durationMinutes,
        durationSeconds: settings.durationSeconds,
        durationMilliseconds: settings.durationMilliseconds,
      }),
    [
      settings.clickInterval,
      settings.clickSpeed,
      settings.rateInputMode,
      settings.durationHours,
      settings.durationMinutes,
      settings.durationSeconds,
      settings.durationMilliseconds,
    ],
  );

  const doubleClickDisabled = !(currentClicksPerSecond < 11);
  const doubleClickDisabledReason = useMemo(
    () =>
      doubleClickDisabled
        ? `Double Click is unavailable at ${formatClicksPerSecond(currentClicksPerSecond)} clicks/sec. Lower the click speed below 10 clicks/sec to turn it on.`
        : undefined,
    [doubleClickDisabled, currentClicksPerSecond],
  );

  return (
    <div className="adv-sectioncontainer adv-basic-card">
      <div className="adv-card-header">
        <div style={HEADER_ROW_STYLE}>
          <span style={HEADER_ICON_STYLE}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="currentColor"
              stroke-width="0"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z" />
            </svg>
          </span>
          <span className="adv-card-title">Clicker Type</span>
        </div>
        <div className="adv-seg-group adv-input-type-group">
          {INPUT_TYPE_OPTIONS.map((inputTypeOption) => (
            <button
              key={inputTypeOption.value}
              type="button"
              className={`adv-seg-btn ${
                settings.inputType === inputTypeOption.value ? "active" : ""
              }`}
              onClick={() => handleInputTypeSelect(inputTypeOption.value)}
            >
              {inputTypeOption.label}
            </button>
          ))}
        </div>
      </div>
      <CardDivider />
      <div className="adv-card-desc">
        Select the mouse button or keyboard key the autoclicker clicks.
      </div>
      <div className="adv-row adv-target-row" style={TARGET_ROW_STYLE}>
        {settings.inputType === "mouse" ? (
          <>
            <div style={TARGET_LABEL_GROUP_STYLE}>
              <span className="adv-label">Double Click</span>
              <ToggleBtn
                value={settings.doubleClickEnabled}
                onChange={handleDoubleClickChange}
                disabled={doubleClickDisabled}
                disabledReason={doubleClickDisabledReason}
              />
            </div>
            <div className="adv-seg-group adv-target-mouse-buttons">
              {MOUSE_BUTTON_OPTIONS.map((mouseButtonOption: string) => (
                <button
                  key={mouseButtonOption}
                  type="button"
                  className={`adv-seg-btn ${settings.mouseButton === mouseButtonOption ? "active" : ""}`}
                  onClick={() => handleMouseButtonSelect(mouseButtonOption)}
                >
                  {mouseButtonOption}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={TARGET_LABEL_GROUP_STYLE}>
              <span className="adv-label">Double Click</span>
              <ToggleBtn
                value={settings.doubleClickEnabled}
                onChange={handleDoubleClickChange}
                disabled={doubleClickDisabled}
                disabledReason={doubleClickDisabledReason}
              />
            </div>
            <div className="adv-textbox">
              <KeyCaptureInput
                className="adv-textbox-text"
                style={KEY_CAPTURE_STYLE}
                value={settings.keyboardKey}
                onChange={handleKeyboardKeyChange}
                keyboardKeyCase={settings.keyboardKeyCase}
                onMouseButtonCapture={handleMouseButtonCapture}
                conflicts={autoPressKeyConflicts}
              />
              <button
                type="button"
                className={`adv-key-case-toggle ${
                  keyboardKeyCaseIsUpper
                    ? "adv-key-case-toggle--upper"
                    : "adv-key-case-toggle--lower"
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
                <span
                  className={
                    keyboardKeyCaseIsUpper
                      ? undefined
                      : "adv-key-case-arrow--lower"
                  }
                >
                  {keyboardKeyCaseLabel}
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
