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
    { value: "mouse", label: "마우스" },
    { value: "keyboard", label: "키보드" },
  ] as const;
  const mouseButtonLabels: Record<MouseButton, string> = {
    Left: "왼쪽",
    Middle: "가운데",
    Right: "오른쪽",
  };

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
    ? `현재 속도 ${formatClicksPerSecond(currentClicksPerSecond)}클릭/초에서는 더블 클릭을 사용할 수 없습니다. 클릭 속도를 10클릭/초 미만으로 낮추면 켤 수 있습니다.`
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
          <span className="adv-card-title">입력 방식</span>
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
        자동 클릭기가 사용할 마우스 버튼 또는 키보드 키를 선택합니다.
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
              <span className="adv-label">더블 클릭</span>
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
                  {mouseButtonLabels[mouseButtonOption as MouseButton]}
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
              <span className="adv-label">더블 클릭</span>
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
                    ? "문자를 대문자로 전송"
                    : "문자를 소문자로 전송"
                }
                aria-pressed={keyboardKeyCaseIsUpper}
                title="키보드 키 대소문자 전환"
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
