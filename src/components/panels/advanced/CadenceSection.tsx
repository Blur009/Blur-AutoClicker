import type { MouseButton, Settings } from "../../../store";
import { useTranslation, type TranslationKey } from "../../../i18n";
import { MOUSE_BUTTON_OPTIONS } from "../../../settingsSchema";
import { isAlphabeticKeyboardKey } from "../../../keyboardKeyCase";
import CadenceInput from "../../CadenceInput";
import HotkeyCaptureInput from "../../HotkeyCaptureInput";
import KeyCaptureInput from "../../KeyCaptureInput";
import { CardDivider, InfoIcon } from "./shared";

function MouseTargetIcon() {
  return (
    <svg
      className="adv-input-type-icon"
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="7"
        y="3"
        width="10"
        height="18"
        rx="5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 3v6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function KeyboardTargetIcon() {
  return (
    <svg
      className="adv-input-type-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="6"
        width="18"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M7 10h.01M11 10h.01M15 10h.01M17 14H7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

export default function CadenceSection({ settings, update, showInfo }: Props) {
  const { t } = useTranslation();
  const rowSpacing = 8;
  const inputTypeOptions = [
    {
      value: "mouse",
      label: t("advanced.mouseButton"),
      icon: <MouseTargetIcon />,
    },
    {
      value: "keyboard",
      label: t("advanced.keyboardKey"),
      icon: <KeyboardTargetIcon />,
    },
  ] as const;
  const canToggleKeyboardKeyCase = isAlphabeticKeyboardKey(settings.keyboardKey);
  const keyboardKeyCaseIsUpper = settings.keyboardKeyCase === "upper";
  const keyboardKeyCaseLabel = keyboardKeyCaseIsUpper ? "↑" : "↓";
  const toggleKeyboardKeyCase = () => {
    if (!canToggleKeyboardKeyCase) return;
    update({
      keyboardKeyCase: keyboardKeyCaseIsUpper ? "lower" : "upper",
    });
  };

  return (
    <div className="adv-sectioncontainer adv-basic-card">
      <div className="adv-card-header adv-cadence-header">
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {showInfo ? (
            <InfoIcon text={t("advanced.cadenceDescription")} />
          ) : null}
          <span className="adv-card-title">{t("advanced.cadence")}</span>
        </div>
      </div>
      <CardDivider />
      <CadenceInput
        settings={settings}
        update={update}
        variant="advanced"
        showInfo={showInfo}
      />
      <div className="adv-row" style={{ marginTop: rowSpacing }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {showInfo ? (
            <InfoIcon text={t("advanced.hotkeyDescription")} />
          ) : null}
          <span className="adv-label">{t("advanced.hotkey")}</span>
        </div>
        <div className="adv-row" style={{ marginLeft: "auto", gap: 8 }}>
          <div className="adv-textbox">
            <HotkeyCaptureInput
              className="adv-textbox-text"
              value={settings.hotkey}
              onChange={(hotkey: string) => update({ hotkey })}
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                width: "150px",
              }}
            />
          </div>
          <div className="adv-seg-group">
            {(["Toggle", "Hold"] as const).map((clickModeOption) => (
              <button
                key={clickModeOption}
                className={`adv-seg-btn ${settings.mode === clickModeOption ? "active" : ""}`}
                onClick={() => update({ mode: clickModeOption })}
              >
                {t(`options.mode.${clickModeOption}` as TranslationKey)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="adv-row adv-target-row" style={{ marginTop: rowSpacing }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {showInfo ? (
            <InfoIcon
              text={
                settings.inputType === "mouse"
                  ? t("advanced.mouseButtonDescription")
                  : t("advanced.keyboardKeyDescription")
              }
            />
          ) : null}
          <span className="adv-label">
            {settings.inputType === "mouse"
              ? t("advanced.mouseButton")
              : t("advanced.keyboardKey")}
          </span>
        </div>
        <div className="adv-target-controls">
          <div className="adv-seg-group adv-input-type-group">
            {inputTypeOptions.map((inputTypeOption) => (
              <button
                key={inputTypeOption.value}
                type="button"
                className={`adv-seg-btn adv-icon-seg-btn ${
                  settings.inputType === inputTypeOption.value ? "active" : ""
                }`}
                aria-label={inputTypeOption.label}
                title={inputTypeOption.label}
                onClick={() =>
                  update({
                    inputType: inputTypeOption.value as Settings["inputType"],
                  })
                }
              >
                {inputTypeOption.icon}
              </button>
            ))}
          </div>
          {settings.inputType === "mouse" ? (
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
                  {t(`options.mouseButton.${mouseButtonOption}` as TranslationKey)}
                </button>
              ))}
            </div>
          ) : (
            <div className="adv-textbox adv-key-target-box">
              <KeyCaptureInput
                className="adv-textbox-text adv-key-input"
                value={settings.keyboardKey}
                onChange={(key) => update({ keyboardKey: key })}
                keyboardKeyCase={settings.keyboardKeyCase}
                onMouseButtonCapture={(mouseButton) =>
                  update({ inputType: "mouse", mouseButton })
                }
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                }}
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
                {keyboardKeyCaseLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
