import type { Settings } from "../../../../store";

import {
  SETTINGS_LIMITS,
  DUTY_CYCLE_MODE_OPTIONS,
} from "../../../../settingsSchema";
import { CardDivider, NumInput } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export default function DutyCycleSection({ settings, update }: Props) {
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
          <span style={{ color: "var(--text-dim)" }}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M6 20v-2a6 6 0 1 1 12 0v2a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1" />
              <path d="M6 4v2a6 6 0 1 0 12 0v-2a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1" />
            </svg>
          </span>
          <span className="adv-card-title">Duty Cycle</span>
        </div>
        <div className="adv-seg-group">
          {DUTY_CYCLE_MODE_OPTIONS.map((dutyCycleOption) => (
            <button
              key={dutyCycleOption}
              className={`adv-seg-btn ${settings.dutyCycleMode === dutyCycleOption ? "active" : ""}`}
              onClick={() => {
                if (
                  dutyCycleOption === "Hold" &&
                  settings.dutyCycleMode !== "Hold"
                ) {
                  update({
                    dutyCycleMode: "Hold",
                    savedClickSpeed: settings.clickSpeed,
                    savedClickInterval: settings.clickInterval,
                    savedDutyCycle: settings.dutyCycle,
                    clickSpeed: 1,
                    clickInterval: "d",
                    dutyCycle: 100,
                  });
                } else if (
                  dutyCycleOption === "Click" &&
                  settings.dutyCycleMode !== "Click"
                ) {
                  update({
                    dutyCycleMode: "Click",
                    clickSpeed: settings.savedClickSpeed,
                    clickInterval:
                      settings.savedClickInterval as Settings["clickInterval"],
                    dutyCycle: settings.savedDutyCycle,
                  });
                }
              }}
            >
              {dutyCycleOption}
            </button>
          ))}
        </div>
      </div>
      <CardDivider />
      <div className="adv-card-desc">
        {settings.dutyCycleMode === "Click"
          ? "Controls how long the button is held during each click."
          : "Holds the button down continuously. Click speed is disabled."}
      </div>
      {settings.dutyCycleMode === "Click" && (
        <div className="adv-row" style={{ gap: 8, justifyContent: "flex-end" }}>
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
          <span
            style={{
              color: "var(--text-dim)",
              fontSize: "13px",
              whiteSpace: "nowrap",
            }}
          >
            hold duration
          </span>
        </div>
      )}
    </div>
  );
}
