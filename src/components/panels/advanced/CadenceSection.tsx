import type { MouseButton, Settings } from "../../../store";
import { useTranslation, type TranslationKey } from "../../../i18n";
import { MOUSE_BUTTON_OPTIONS } from "../../../settingsSchema";
import CadenceInput from "../../CadenceInput";
import HotkeyCaptureInput from "../../HotkeyCaptureInput";
import KeyCaptureInput from "../../KeyCaptureInput";
import { CardDivider, InfoIcon } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

export default function CadenceSection({ settings, update, showInfo }: Props) {
  const { t } = useTranslation();
  const rowSpacing = 8;
  const inputTypeOptions = [
    { value: "mouse", label: "Mouse" },
    { value: "keyboard", label: "Keyboard" },
  ] as const;

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
      <div className="adv-row" style={{ marginTop: rowSpacing }}>
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
                  : "Select which keyboard key the clicker will press on each click event."
              }
            />
          ) : null}
          <span className="adv-label">
            {settings.inputType === "mouse" ? t("advanced.mouseButton") : "Keyboard Key"}
          </span>
        </div>
        <div className="adv-row" style={{ marginLeft: "auto", gap: 8 }}>
          <div className="adv-seg-group">
            {inputTypeOptions.map((inputTypeOption) => (
              <button
                key={inputTypeOption.value}
                className={`adv-seg-btn ${settings.inputType === inputTypeOption.value ? "active" : ""}`}
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
          {settings.inputType === "mouse" ? (
            <div className="adv-seg-group">
              {MOUSE_BUTTON_OPTIONS.map((mouseButtonOption: string) => (
                <button
                  key={mouseButtonOption}
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
            <div className="adv-textbox">
              <KeyCaptureInput
                className="adv-textbox-text"
                value={settings.keyboardKey}
                onChange={(key) => update({ keyboardKey: key })}
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  width: "100px",
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  update({ inputType: "mouse" });
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
