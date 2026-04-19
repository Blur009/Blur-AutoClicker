import { useState } from "react";
import type { Settings } from "../../../store";
import { useTranslation } from "../../../i18n";
import { invoke } from "@tauri-apps/api/core";
import { Disableable, NumInput, ToggleBtn, CardDivider } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

interface CursorPoint {
  x: number;
  y: number;
}

export default function CustomStopZoneSection({ settings, update, showInfo }: Props) {
  const { t } = useTranslation();
  const [capturingCursor, setCapturingCursor] = useState(false);

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
        <span className="adv-card-title">
          {t("advanced.customStopZone")}
        </span>
        <ToggleBtn
          value={settings.customStopZoneEnabled}
          onChange={(v) => update({ customStopZoneEnabled: v })}
        />
      </div>
      <CardDivider />
      <Disableable enabled={settings.customStopZoneEnabled}>
        <div className="adv-stop-zone-body">
          {showInfo && (
            <p className="adv-desc">
              {t("advanced.customStopZoneDescription")}
            </p>
          )}
          <div className="adv-stop-zone-controls">
            <div className="adv-stop-zone-grid">
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
              <div className="adv-numbox-sm adv-sequence-coord">
                <span className="adv-unit">W</span>
                <NumInput
                  value={settings.customStopZoneWidth}
                  onChange={(v) => update({ customStopZoneWidth: v })}
                  min={1}
                  style={{ width: "54px", textAlign: "right" }}
                />
              </div>
              <div className="adv-numbox-sm adv-sequence-coord">
                <span className="adv-unit">H</span>
                <NumInput
                  value={settings.customStopZoneHeight}
                  onChange={(v) => update({ customStopZoneHeight: v })}
                  min={1}
                  style={{ width: "54px", textAlign: "right" }}
                />
              </div>
            </div>
            <div className="adv-sequence-actions adv-stop-zone-actions">
              <button
                type="button"
                className="adv-secondary-btn"
                onClick={() => { void setCustomStopZoneTopLeft(); }}
                disabled={capturingCursor}
              >
                {t("advanced.customStopZoneSetTopLeft")}
              </button>
              <button
                type="button"
                className="adv-secondary-btn"
                onClick={() => { void setCustomStopZoneBottomRight(); }}
                disabled={capturingCursor}
              >
                {t("advanced.customStopZoneSetBottomRight")}
              </button>
            </div>
          </div>
        </div>
      </Disableable>
    </div>
  );
}