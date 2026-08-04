import type { Settings } from "../../../../store";

import { SETTINGS_LIMITS } from "../../../../settingsSchema";
import {
  Disableable,
  NumInput,
  ToggleBtn,
  CardDivider,
} from "../../advanced/sections/shared";

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

export default function FailsafeSection({ settings, update }: Props) {
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
            <span className="adv-card-title">모서리 중지</span>
          </div>
          <ToggleBtn
            value={settings.cornerStopEnabled}
            onChange={(v) => update({ cornerStopEnabled: v })}
          />
        </div>
        <CardDivider />
        <div className="adv-card-desc">
          커서가 화면 모서리에 들어가면 클릭을 중지합니다. 안전을 위해 켜 두는
          것을 권장합니다.
        </div>
        <Disableable
          enabled={settings.cornerStopEnabled}
          disabledReason="모서리 중지를 켜야 모서리 안전장치 영역을 편집할 수 있습니다."
        >
          <div className="adv-row" style={{ gap: 8 }}>
            <div className="adv-corner-grid">
              {(["tl", "tr", "bl", "br"] as const).map((cornerKey) => (
                <div
                  key={cornerKey}
                  className="adv-corner-box adv-stop-boundary-box"
                >
                  <div className={`adv-arc adv-arc-${cornerKey}`} />
                  <NumInput
                    value={settings[CORNER_KEYS[cornerKey]]}
                    onChange={(v) => update({ [CORNER_KEYS[cornerKey]]: v })}
                    min={SETTINGS_LIMITS.stopBoundary.min}
                    max={SETTINGS_LIMITS.stopBoundary.max}
                    hoverWheel={false}
                    style={{ width: "74px", textAlign: "right" }}
                  />
                  <span className="adv-unit">px</span>
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
            <span className="adv-card-title">가장자리 중지</span>
          </div>
          <ToggleBtn
            value={settings.edgeStopEnabled}
            onChange={(v) => update({ edgeStopEnabled: v })}
          />
        </div>
        <CardDivider />
        <div className="adv-card-desc">
          커서가 화면 가장자리에 닿으면 클릭을 중지합니다. 안전을 위해 켜 두는
          것을 권장합니다.
        </div>
        <Disableable
          enabled={settings.edgeStopEnabled}
          disabledReason="가장자리 중지를 켜야 가장자리 안전장치 영역을 편집할 수 있습니다."
        >
          <div className="adv-row" style={{ gap: 8 }}>
            <div className="adv-corner-grid">
              {(["top", "right", "left", "bottom"] as const).map((edgeSide) => (
                <div
                  key={edgeSide}
                  className="adv-corner-box adv-stop-boundary-box"
                >
                  <div className={`adv-edge-bar adv-edge-bar-${edgeSide}`} />
                  <NumInput
                    value={settings[EDGE_KEYS[edgeSide]]}
                    onChange={(v) => update({ [EDGE_KEYS[edgeSide]]: v })}
                    min={SETTINGS_LIMITS.stopBoundary.min}
                    max={SETTINGS_LIMITS.stopBoundary.max}
                    hoverWheel={false}
                    style={{ width: "74px", textAlign: "right" }}
                  />
                  <span className="adv-unit">px</span>
                </div>
              ))}
            </div>
          </div>
        </Disableable>
      </div>
    </>
  );
}
