import type { Settings } from "../../../../store";

import { SETTINGS_LIMITS } from "../../../../settingsSchema";
import { InfoIcon, NumInput } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

export default function DutyCycleSection({
  settings,
  update,
  showInfo,
}: Props) {
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
          {showInfo ? (
            <InfoIcon text="Choose how long the mouse button gets held during each click. 50% at 1 click per second = 0.5sec held, 0.5sec released" />
          ) : null}
          <span className="adv-card-title">Click Duration</span>
        </div>
        <div className="adv-row" style={{ gap: 6 }}>
          <div className="adv-minmax">
            <div className="adv-numbox-sm">
              <NumInput
                value={settings.dutyCycle}
                onChange={(v) => update({ dutyCycle: v })}
                min={SETTINGS_LIMITS.dutyCycle.min}
                max={SETTINGS_LIMITS.dutyCycle.max}
              />
              <span className="adv-unit">%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
