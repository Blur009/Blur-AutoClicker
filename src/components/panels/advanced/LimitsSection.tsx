import { useEffect, useState } from "react";
import type { Settings, TimeLimitUnit } from "../../../store";
import { useTranslation, type TranslationKey } from "../../../i18n";
import {
  SETTINGS_LIMITS,
  TIME_LIMIT_UNIT_OPTIONS,
} from "../../../settingsSchema";
import { Disableable, NumInput, ToggleBtn, InfoIcon } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

export default function LimitsSection({ settings, update, showInfo }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"clicks" | "time">(() =>
    settings.timeLimitEnabled && !settings.clickLimitEnabled
      ? "time"
      : "clicks",
  );

  const selectedMode =
    settings.timeLimitEnabled && !settings.clickLimitEnabled
      ? "time"
      : settings.clickLimitEnabled && !settings.timeLimitEnabled
        ? "clicks"
        : mode;

  useEffect(() => {
    if (settings.clickLimitEnabled && settings.timeLimitEnabled) {
      if (selectedMode === "clicks") {
        update({ timeLimitEnabled: false });
      } else {
        update({ clickLimitEnabled: false });
      }
    }
  }, [
    settings.clickLimitEnabled,
    settings.timeLimitEnabled,
    selectedMode,
    update,
  ]);

  const isClicksMode = selectedMode === "clicks";
  const activeEnabled = isClicksMode
    ? settings.clickLimitEnabled
    : settings.timeLimitEnabled;
  const activeUnavailableReason = isClicksMode
    ? t("advanced.clickLimitUnavailable")
    : t("advanced.timeLimitUnavailable");

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
                  ? t("advanced.clickLimitDescription")
                  : t("advanced.timeLimitDescription")
              }
            />
          ) : null}
          <span className="adv-card-title">{t("advanced.limits")}</span>
        </div>
        <ToggleBtn value={activeEnabled} onChange={handleToggleChange} />
      </div>
      <div
        className="adv-row"
        style={{
          gap: 6,
          marginTop: 6,
          width: "100%",
          justifyContent: "space-between",
        }}
      >
        <Disableable
          enabled={activeEnabled}
          disabledReason={activeUnavailableReason}
        >
          <div className="adv-row" style={{ gap: 6 }}>
            {isClicksMode ? (
              <div className="adv-numbox-sm">
                <NumInput
                  value={settings.clickLimit}
                  onChange={(v) => update({ clickLimit: v })}
                  min={SETTINGS_LIMITS.clickLimit.min}
                  style={{ width: "89px", textAlign: "right" }}
                />
                <span className="adv-unit">{t("advanced.clicksUnit")}</span>
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
                        {t(
                          `options.timeUnitShort.${timeLimitUnitOption}` as TranslationKey,
                        )}
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
                {t("advanced.clickLimit")}
              </button>
              <button
                type="button"
                className={`adv-seg-btn ${!isClicksMode ? "active" : ""}`}
                onClick={() => handleModeChange("time")}
              >
                {t("advanced.timeLimit")}
              </button>
            </div>
          </div>
        </Disableable>
      </div>
    </div>
  );
}
