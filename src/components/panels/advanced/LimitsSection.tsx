import type { Settings, TimeLimitUnit } from "../../../store";
import { useTranslation, type TranslationKey } from "../../../i18n";
import {
  SETTINGS_LIMITS,
  TIME_LIMIT_UNIT_OPTIONS,
} from "../../../settingsSchema";
import { Disableable, NumInput, ToggleBtn, CardDivider } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

export default function LimitsSection({ settings, update }: Props) {
  const { t } = useTranslation();

  return (
    <div className="adv-sectioncontainer adv-limits-card">
      <div className="adv-row" style={{ justifyContent: "space-between" }}>
        <span className="adv-card-title">{t("advanced.clickLimit")}</span>
        <div className="adv-row" style={{ gap: 6 }}>
          <Disableable
            enabled={settings.clickLimitEnabled}
            disabledReason={t("advanced.clickLimitUnavailable")}
          >
            <div className="adv-numbox-sm">
              <NumInput
                value={settings.clickLimit}
                onChange={(v) => update({ clickLimit: v })}
                min={SETTINGS_LIMITS.clickLimit.min}
                style={{ width: "89px", textAlign: "right" }}
              />
              <span className="adv-unit">{t("advanced.clicksUnit")}</span>
            </div>
          </Disableable>
          <ToggleBtn
            value={settings.clickLimitEnabled}
            onChange={(v) => update({ clickLimitEnabled: v })}
          />
        </div>
      </div>
      <CardDivider />
      <div className="adv-row" style={{ justifyContent: "space-between" }}>
        <span className="adv-card-title">{t("advanced.timeLimit")}</span>
        <div className="adv-row" style={{ gap: 6 }}>
          <Disableable
            enabled={settings.timeLimitEnabled}
            disabledReason={t("advanced.timeLimitUnavailable")}
          >
            <div className="adv-row" style={{ gap: 6 }}>
              <div className="adv-numbox-sm">
                <NumInput
                  value={settings.timeLimit}
                  onChange={(v) => update({ timeLimit: v })}
                  min={SETTINGS_LIMITS.timeLimit.min}
                  style={{ width: "38px", textAlign: "right" }}
                />
              </div>
              <div className="adv-seg-group">
                {TIME_LIMIT_UNIT_OPTIONS.map((timeLimitUnitOption: string) => (
                  <button
                    key={timeLimitUnitOption}
                    className={`adv-seg-btn ${settings.timeLimitUnit === timeLimitUnitOption ? "active" : ""}`}
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
                ))}
              </div>
            </div>
          </Disableable>
          <ToggleBtn
            value={settings.timeLimitEnabled}
            onChange={(v) => update({ timeLimitEnabled: v })}
          />
        </div>
      </div>
    </div>
  );
}
