import type { Settings } from "../../../store";
import { useTranslation } from "../../../i18n";
import { SETTINGS_LIMITS } from "../../../settingsSchema";
import { Disableable, NumInput, ToggleBtn } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

export default function SpeedVariationSection({ settings, update, showInfo }: Props) {
  const { t } = useTranslation();

  return (
    <div className="adv-sectioncontainer adv-basic-card">
      <div className="adv-card-header">
        <span className="adv-card-title">
          {t("advanced.speedVariation")}
        </span>
        <div className="adv-row" style={{ gap: 8 }}>
          <Disableable
            enabled={settings.speedVariationEnabled}
            disabledReason={t("advanced.speedVariationUnavailable")}
          >
            <div className="adv-numbox-sm">
              <NumInput
                value={settings.speedVariation}
                onChange={(v) => update({ speedVariation: v })}
                min={SETTINGS_LIMITS.speedVariation.min}
                max={SETTINGS_LIMITS.speedVariation.max}
              />
              <span className="adv-unit">%</span>
            </div>
          </Disableable>
          <ToggleBtn
            value={settings.speedVariationEnabled}
            onChange={(v) => update({ speedVariationEnabled: v })}
          />
        </div>
      </div>
      <Disableable
        enabled={settings.speedVariationEnabled}
        disabledReason={t("advanced.speedVariationUnavailable")}
      >
        {showInfo ? <p className="adv-desc">{t("advanced.speedVariationDescription")}</p> : null}
      </Disableable>
    </div>
  );
}