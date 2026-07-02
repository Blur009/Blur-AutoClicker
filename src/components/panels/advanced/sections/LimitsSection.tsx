import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Settings, TimeLimitUnit } from "../../../../store";

import {
  SETTINGS_LIMITS,
  TIME_LIMIT_UNIT_OPTIONS,
} from "../../../../settingsSchema";
import { Disableable, NumInput, ToggleBtn, InfoIcon } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

export default function LimitsSection({ settings, update, showInfo }: Props) {
  const [mode, setMode] = useState<"clicks" | "time">("clicks");
  const effectiveMode: "clicks" | "time" =
    settings.timeLimitEnabled !== settings.clickLimitEnabled
      ? settings.timeLimitEnabled
        ? "time"
        : "clicks"
      : mode;

  const updateRef = useRef(update);

  useLayoutEffect(() => {
    updateRef.current = update;
  });

  useEffect(() => {
    if (settings.clickLimitEnabled && settings.timeLimitEnabled) {
      if (effectiveMode === "clicks") {
        updateRef.current({ timeLimitEnabled: false });
      } else {
        updateRef.current({ clickLimitEnabled: false });
      }
    }
  }, [settings.clickLimitEnabled, settings.timeLimitEnabled, effectiveMode]);

  const isClicksMode = effectiveMode === "clicks";
  const activeEnabled = isClicksMode
    ? settings.clickLimitEnabled
    : settings.timeLimitEnabled;
  const activeUnavailableReason = isClicksMode
    ? "Enable Click Limit to stop automatically after a set number of clicks."
    : "Enable Time Limit to stop automatically after a set amount of time.";

  const handleModeChange = (nextMode: "clicks" | "time") => {
    const wasEnabled = activeEnabled;
    setMode(nextMode);
    if (nextMode === "clicks") {
      update({
        clickLimitEnabled: wasEnabled,
        timeLimitEnabled: false,
      });
    } else {
      update({
        timeLimitEnabled: wasEnabled,
        clickLimitEnabled: false,
      });
    }
  };

  const handleToggleChange = (nextValue: boolean) => {
    if (isClicksMode) {
      update({
        clickLimitEnabled: nextValue,
        timeLimitEnabled: false,
      });
    } else {
      update({
        timeLimitEnabled: nextValue,
        clickLimitEnabled: false,
      });
    }
  };

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
            <InfoIcon
              text={
                isClicksMode
                  ? "Stops automatically after the selected number of clicks."
                  : "Stops automatically after the selected duration."
              }
            />
          ) : null}
          <span className="adv-card-title">Limits</span>
        </div>
        <ToggleBtn value={activeEnabled} onChange={handleToggleChange} />
      </div>
      <div
        className="adv-row"
        style={{
          gap: 6,
          marginTop: 6,
          width: "100%",
          justifyContent: "flex-end",
        }}
      >
        <Disableable
          enabled={activeEnabled}
          disabledReason={activeUnavailableReason}
        >
          <div className="adv-row" style={{ gap: 6, marginLeft: "auto" }}>
            {isClicksMode ? (
              <div className="adv-numbox-sm">
                <NumInput
                  value={settings.clickLimit}
                  onChange={(v) => update({ clickLimit: v })}
                  min={SETTINGS_LIMITS.clickLimit.min}
                  style={{ width: "89px", textAlign: "right" }}
                />
                <span className="adv-unit">clicks</span>
              </div>
            ) : (
              <>
                <div className="adv-numbox-sm">
                  <NumInput
                    value={settings.timeLimit}
                    onChange={(v) => update({ timeLimit: v })}
                    min={SETTINGS_LIMITS.timeLimit.min}
                    style={{ width: "38px", textAlign: "right" }}
                  />
                </div>
                <div className="adv-seg-group">
                  {TIME_LIMIT_UNIT_OPTIONS.map(
                    (timeLimitUnitOption: string) => (
                      <button
                        key={timeLimitUnitOption}
                        className={`adv-seg-btn-dynamic ${settings.timeLimitUnit === timeLimitUnitOption ? "active" : ""}`}
                        onClick={() =>
                          update({
                            timeLimitUnit: timeLimitUnitOption as TimeLimitUnit,
                          })
                        }
                      >
                        {timeLimitUnitOption}
                      </button>
                    ),
                  )}
                </div>
              </>
            )}
            <div className="adv-seg-group">
              <button
                type="button"
                className={`adv-seg-btn ${isClicksMode ? "active" : ""}`}
                onClick={() => handleModeChange("clicks")}
              >
                Click
              </button>
              <button
                type="button"
                className={`adv-seg-btn ${!isClicksMode ? "active" : ""}`}
                onClick={() => handleModeChange("time")}
              >
                Time
              </button>
            </div>
          </div>
        </Disableable>
      </div>
    </div>
  );
}
