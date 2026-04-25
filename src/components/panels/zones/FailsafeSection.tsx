import type { Settings } from "../../../store";
import { useTranslation } from "../../../i18n";
import { SETTINGS_LIMITS } from "../../../settingsSchema";
import {
  Disableable,
  NumInput,
  ToggleBtn,
  CardDivider,
  InfoIcon,
} from "../advanced/shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

const CORNER_KEYS = {
  tl: "cornerStopTL",
  tr: "cornerStopTR",
  bl: "cornerStopBL",
  br: "cornerStopBR",
} as const;

const EDGE_KEYS = {
  top: "edgeStopTop",
  right: "edgeStopRight",
  left: "edgeStopLeft",
  bottom: "edgeStopBottom",
} as const;

export default function FailsafeSection({ settings, update, showInfo }: Props) {
  const { t } = useTranslation();
  const cornerControls = [
    { key: "tl", label: t("advanced.cornerTopLeft") },
    { key: "tr", label: t("advanced.cornerTopRight") },
    { key: "bl", label: t("advanced.cornerBottomLeft") },
    { key: "br", label: t("advanced.cornerBottomRight") },
  ] as const;
  const edgeControls = [
    { key: "top", label: t("advanced.edgeTop") },
    { key: "right", label: t("advanced.edgeRight") },
    { key: "left", label: t("advanced.edgeLeft") },
    { key: "bottom", label: t("advanced.edgeBottom") },
  ] as const;

  return (
    <>
      <div className="adv-sectioncontainer">
        <div className="adv-card-header">
          <div
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            {showInfo ? (
              <InfoIcon text={t("advanced.cornerStopDescription")} />
            ) : null}
            <span className="adv-card-title">{t("advanced.cornerStop")}</span>
          </div>
          <ToggleBtn
            value={settings.cornerStopEnabled}
            onChange={(v) => update({ cornerStopEnabled: v })}
          />
        </div>
        <CardDivider />
        <Disableable
          enabled={settings.cornerStopEnabled}
          disabledReason={t("advanced.cornerStopUnavailable")}
        >
          <div className="zones-card-body">
            <p className="zones-card-help">{t("advanced.cornerStopHelper")}</p>
            <div className="zones-boundary-grid">
              {cornerControls.map(({ key, label }) => (
                <div key={key} className="zones-boundary-control">
                  <span className="zones-boundary-label">{label}</span>
                  <div className="adv-corner-box zones-boundary-input">
                    <div className={`adv-arc adv-arc-${key}`} />
                    <NumInput
                      value={settings[CORNER_KEYS[key]]}
                      onChange={(v) => update({ [CORNER_KEYS[key]]: v })}
                      min={SETTINGS_LIMITS.stopBoundary.min}
                      max={SETTINGS_LIMITS.stopBoundary.max}
                      style={{ width: "34px", textAlign: "right" }}
                    />
                    <span className="adv-unit">px</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Disableable>
      </div>

      <div className="adv-sectioncontainer">
        <div className="adv-card-header">
          <div
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            {showInfo ? (
              <InfoIcon text={t("advanced.edgeStopDescription")} />
            ) : null}
            <span className="adv-card-title">{t("advanced.edgeStop")}</span>
          </div>
          <ToggleBtn
            value={settings.edgeStopEnabled}
            onChange={(v) => update({ edgeStopEnabled: v })}
          />
        </div>
        <CardDivider />
        <Disableable
          enabled={settings.edgeStopEnabled}
          disabledReason={t("advanced.edgeStopUnavailable")}
        >
          <div className="zones-card-body">
            <p className="zones-card-help">{t("advanced.edgeStopHelper")}</p>
            <div className="zones-boundary-grid">
              {edgeControls.map(({ key, label }) => (
                <div key={key} className="zones-boundary-control">
                  <span className="zones-boundary-label">{label}</span>
                  <div className="adv-corner-box zones-boundary-input">
                    <div className={`adv-edge-bar adv-edge-bar-${key}`} />
                    <NumInput
                      value={settings[EDGE_KEYS[key]]}
                      onChange={(v) => update({ [EDGE_KEYS[key]]: v })}
                      min={SETTINGS_LIMITS.stopBoundary.min}
                      max={SETTINGS_LIMITS.stopBoundary.max}
                      style={{ width: "34px", textAlign: "right" }}
                    />
                    <span className="adv-unit">px</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Disableable>
      </div>
    </>
  );
}
