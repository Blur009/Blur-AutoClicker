import type { Settings } from "../../../store";
import { useTranslation, type TranslationKey } from "../../../i18n";
import {
  CLICK_ACTION_OPTIONS,
  MOUSE_BUTTON_OPTIONS,
  type MouseButton,
} from "../../../settingsSchema";
import CadenceInput from "../../CadenceInput";
import HotkeyCaptureInput from "../../HotkeyCaptureInput";
import { InfoIcon } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

export default function CadenceSection({ settings, update, showInfo }: Props) {
  const { t } = useTranslation();
  const rowSpacing = 8;

  return (
    <div className="adv-sectioncontainer adv-basic-card">
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
            <InfoIcon text={t("advanced.mouseButtonDescription")} />
          ) : null}
          <span className="adv-label">{t("advanced.mouseButton")}</span>
        </div>
        <div className="adv-row" style={{ marginLeft: "auto" }}>
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
            <InfoIcon text={t("advanced.clickActionDescription")} />
          ) : null}
          <span className="adv-label">{t("advanced.clickAction")}</span>
        </div>
        <div className="adv-row" style={{ marginLeft: "auto" }}>
          <div className="adv-seg-group adv-seg-group-click-action">
            {CLICK_ACTION_OPTIONS.map((clickActionOption) => (
              <button
                key={clickActionOption}
                className={`adv-seg-btn adv-seg-btn-click-action ${settings.clickAction === clickActionOption ? "active" : ""}`}
                onClick={() => update({ clickAction: clickActionOption })}
              >
                {t(`options.clickAction.${clickActionOption}` as TranslationKey)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
