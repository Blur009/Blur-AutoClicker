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
            <span className="adv-card-title">Corner Stop</span>
          </div>
          <ToggleBtn
            value={settings.cornerStopEnabled}
            onChange={(v) => update({ cornerStopEnabled: v })}
          />
        </div>
        <CardDivider />
        <div className="adv-card-desc">
          Stops the clicker when your cursor enters a screen corner. Keep this
          enabled as a safety net.
        </div>
        <Disableable
          enabled={settings.cornerStopEnabled}
          disabledReason="Enable Corner Stop to edit the corner failsafe hitboxes."
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
            <span className="adv-card-title">Edge Stop</span>
          </div>
          <ToggleBtn
            value={settings.edgeStopEnabled}
            onChange={(v) => update({ edgeStopEnabled: v })}
          />
        </div>
        <CardDivider />
        <div className="adv-card-desc">
          Stops the clicker when your cursor reaches a screen edge. Keep this
          enabled as a safety net.
        </div>
        <Disableable
          enabled={settings.edgeStopEnabled}
          disabledReason="Enable Edge Stop to edit the edge failsafe hitboxes."
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
