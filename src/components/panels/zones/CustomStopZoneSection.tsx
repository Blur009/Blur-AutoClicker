import { useState } from "react";
import type { Settings } from "../../../store";
import { useTranslation } from "../../../i18n";
import { invoke } from "@tauri-apps/api/core";
import { SETTINGS_LIMITS } from "../../../settingsSchema";
import {
  Disableable,
  NumInput,
  ToggleBtn,
  CardDivider,
  InfoIcon,
} from "../advanced/shared";

// TODO: Needs to have a timer before picking the location of the cursor. say 3 seconds. In the future I would like an overlay approach to this but for now this timer thing is good enough.

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

interface CursorPoint {
  x: number;
  y: number;
}

export default function CustomStopZoneSection({
  settings,
  update,
  showInfo,
}: Props) {
  const { t } = useTranslation();
  const [capturingCursor, setCapturingCursor] = useState(false);
  const zoneRight = settings.customStopZoneX + settings.customStopZoneWidth - 1;
  const zoneBottom =
    settings.customStopZoneY + settings.customStopZoneHeight - 1;

  const requestCursorPosition = async (): Promise<CursorPoint> => {
    setCapturingCursor(true);
    try {
      return await invoke<CursorPoint>("pick_position");
    } finally {
      setCapturingCursor(false);
    }
  };

  const setCustomStopZoneTopLeft = async () => {
    const point = await requestCursorPosition();
    update({
      customStopZoneX: point.x,
      customStopZoneY: point.y,
    });
  };

  const setCustomStopZoneBottomRight = async () => {
    const point = await requestCursorPosition();
    const left = Math.min(settings.customStopZoneX, point.x);
    const top = Math.min(settings.customStopZoneY, point.y);
    const right = Math.max(settings.customStopZoneX, point.x);
    const bottom = Math.max(settings.customStopZoneY, point.y);

    update({
      customStopZoneX: left,
      customStopZoneY: top,
      customStopZoneWidth: right - left + 1,
      customStopZoneHeight: bottom - top + 1,
    });
  };

  return (
    <div className="adv-sectioncontainer">
      <div className="adv-card-header">
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {showInfo ? (
            <InfoIcon text={t("advanced.customStopZoneDescription")} />
          ) : null}
          <span className="adv-card-title">{t("advanced.customStopZone")}</span>
        </div>
        <ToggleBtn
          value={settings.customStopZoneEnabled}
          onChange={(v) => update({ customStopZoneEnabled: v })}
        />
      </div>
      <CardDivider />
      <Disableable
        enabled={settings.customStopZoneEnabled}
        disabledReason={t("advanced.customStopZoneDisabled")}
      >
        <div className="adv-stop-zone-body">
          <p className="zones-card-help">
            {t("advanced.customStopZoneHelper")}
          </p>
          <div className="zones-zone-summary">
            <div
              className={`zones-zone-preview ${
                settings.customStopZoneEnabled ? "active" : ""
              }`}
              aria-hidden="true"
            >
              <div className="zones-zone-preview-rect" />
            </div>
            <div className="zones-zone-summary-copy">
              <span className="zones-boundary-label">
                {t("advanced.customStopZoneCoordinates")}
              </span>
              <span className="zones-zone-summary-value">
                {settings.customStopZoneX}, {settings.customStopZoneY}
                {" -> "}
                {zoneRight}, {zoneBottom}
              </span>
            </div>
          </div>
          <div className="adv-stop-zone-controls">
            <div className="adv-stop-zone-grid">
              <div className="zones-coordinate-group">
                <span className="zones-boundary-label">
                  {t("advanced.customStopZoneOrigin")}
                </span>
                <div className="zones-coordinate-row">
                  <div className="adv-numbox-sm adv-sequence-coord">
                    <span className="adv-unit adv-axis-label">X</span>
                    <NumInput
                      value={settings.customStopZoneX}
                      onChange={(v) => update({ customStopZoneX: v })}
                      style={{ width: "54px", textAlign: "right" }}
                    />
                  </div>
                  <div className="adv-numbox-sm adv-sequence-coord">
                    <span className="adv-unit adv-axis-label">Y</span>
                    <NumInput
                      value={settings.customStopZoneY}
                      onChange={(v) => update({ customStopZoneY: v })}
                      style={{ width: "54px", textAlign: "right" }}
                    />
                  </div>
                </div>
              </div>
              <div className="zones-coordinate-group">
                <span className="zones-boundary-label">
                  {t("advanced.customStopZoneSize")}
                </span>
                <div className="zones-coordinate-row">
                  <div className="adv-numbox-sm adv-sequence-coord">
                    <span className="adv-unit">W</span>
                    <NumInput
                      value={settings.customStopZoneWidth}
                      onChange={(v) => update({ customStopZoneWidth: v })}
                      min={SETTINGS_LIMITS.stopZoneDimension.min}
                      style={{ width: "54px", textAlign: "right" }}
                    />
                  </div>
                  <div className="adv-numbox-sm adv-sequence-coord">
                    <span className="adv-unit">H</span>
                    <NumInput
                      value={settings.customStopZoneHeight}
                      onChange={(v) => update({ customStopZoneHeight: v })}
                      min={SETTINGS_LIMITS.stopZoneDimension.min}
                      style={{ width: "54px", textAlign: "right" }}
                    />
                  </div>
                </div>
              </div>
            </div>
            <p className="zones-card-help zones-card-help-compact">
              {capturingCursor
                ? t("advanced.customStopZoneCapturing")
                : t("advanced.customStopZonePickHelp")}
            </p>
            <div className="adv-sequence-actions adv-stop-zone-actions">
              <button
                type="button"
                className="adv-secondary-btn"
                onClick={() => {
                  void setCustomStopZoneTopLeft();
                }}
                disabled={capturingCursor}
              >
                {capturingCursor
                  ? t("advanced.picking")
                  : t("advanced.customStopZoneSetTopLeft")}
              </button>
              <button
                type="button"
                className="adv-secondary-btn"
                onClick={() => {
                  void setCustomStopZoneBottomRight();
                }}
                disabled={capturingCursor}
              >
                {capturingCursor
                  ? t("advanced.picking")
                  : t("advanced.customStopZoneSetBottomRight")}
              </button>
            </div>
          </div>
        </div>
      </Disableable>
    </div>
  );
}
