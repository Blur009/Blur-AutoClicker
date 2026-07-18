import type { MouseButton, Settings } from "../../../../store";
import { MOUSE_BUTTON_OPTIONS } from "../../../../settingsSchema";
import { isAlphabeticKeyboardKey } from "../../../../keyboardKeyCase";
import { conflictsWithAutoPressKey } from "../../../../hotkeys";
import {
  getEffectiveClicksPerSecond,
  isDoubleClickSupported,
} from "../../../../cadence";
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

export default function ClickerTypeSection({ settings, update }: Props) {
  const inputTypeOptions = [
    { value: "mouse", label: "Mouse" },
    { value: "keyboard", label: "Keyboard" },
  ] as const;

  const canToggleKeyboardKeyCase = isAlphabeticKeyboardKey(
    settings.keyboardKey,
  );
  const keyboardKeyCaseIsUpper = settings.keyboardKeyCase === "upper";
  const keyboardKeyCaseLabel = "↑";
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
  const autoPressKeyConflicts = hasConflict ? ["Hotkey"] : [];

  const currentClicksPerSecond = getEffectiveClicksPerSecond({
    clickInterval: settings.clickInterval,
    clickSpeed: settings.clickSpeed,
    rateInputMode: settings.rateInputMode,
    durationHours: settings.durationHours,
    durationMinutes: settings.durationMinutes,
    durationSeconds: settings.durationSeconds,
    durationMilliseconds: settings.durationMilliseconds,
  });

  const doubleClickDisabled = !isDoubleClickSupported(settings);
  const doubleClickDisabledReason = doubleClickDisabled
    ? `Double Click is unavailable at ${formatClicksPerSecond(currentClicksPerSecond)} clicks/sec. Lower the click speed below 10 clicks/sec to turn it on.`
    : undefined;

  return (
    <div className="adv-sectioncontainer adv-basic-card">
      <div className="adv-card-header">
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span style={{ color: "var(--text-dim)" }}>
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
          {inputTypeOptions.map((inputTypeOption) => (
            <button
              key={inputTypeOption.value}
              type="button"
              className={`adv-seg-btn ${
                settings.inputType === inputTypeOption.value ? "active" : ""
              }`}
              onClick={() =>
                update({
                  inputType: inputTypeOption.value as Settings["inputType"],
                })
              }
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
      <div
        className="adv-row adv-target-row"
        style={{ gap: 8, justifyContent: "flex-end" }}
      >
        {settings.inputType === "mouse" ? (
          <>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                marginRight: "auto",
              }}
            >
              <span className="adv-label">Double Click</span>
              <ToggleBtn
                value={settings.doubleClickEnabled}
                onChange={(v) => update({ doubleClickEnabled: v })}
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
                  onClick={() =>
                    update({ mouseButton: mouseButtonOption as MouseButton })
                  }
                >
                  {mouseButtonOption}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                marginRight: "auto",
              }}
            >
              <span className="adv-label">Double Click</span>
              <ToggleBtn
                value={settings.doubleClickEnabled}
                onChange={(v) => update({ doubleClickEnabled: v })}
                disabled={doubleClickDisabled}
                disabledReason={doubleClickDisabledReason}
              />
            </div>
            <div className="adv-textbox">
              <KeyCaptureInput
                className="adv-textbox-text"
                style={{ minWidth: "6rem" }}
                value={settings.keyboardKey}
                onChange={(key) => update({ keyboardKey: key })}
                keyboardKeyCase={settings.keyboardKeyCase}
                onMouseButtonCapture={(mouseButton) =>
                  update({ inputType: "mouse", mouseButton })
                }
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
