import type { Settings } from "../../../store";

import {
  hasKeyOnlySequenceActions,
  SETTINGS_LIMITS,
} from "../../../settingsSchema";
import UnavailableReason from "../../UnavailableReason";
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
  const clickDurationDisabled = hasKeyOnlySequenceActions(settings);
  const disabledReason =
    "Key sequence actions use each row's hold ms value instead of Click Duration.";

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
          <UnavailableReason
            reason={clickDurationDisabled ? disabledReason : undefined}
          >
            <div
              className={`adv-minmax ${
                clickDurationDisabled ? "adv-control-disabled" : ""
              }`}
            >
              <div className="adv-numbox-sm">
                <NumInput
                  value={settings.dutyCycle}
                  onChange={(v) => update({ dutyCycle: v })}
                  min={SETTINGS_LIMITS.dutyCycle.min}
                  max={SETTINGS_LIMITS.dutyCycle.max}
                  disabled={clickDurationDisabled}
                />
                <span className="adv-unit">%</span>
              </div>
            </div>
          </UnavailableReason>
        </div>
      </div>
    </div>
  );
}
