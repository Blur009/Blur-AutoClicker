import type { Settings } from "../../../store";
import { useTranslation } from "../../../i18n";
import { SETTINGS_LIMITS } from "../../../settingsSchema";
import { NumInput } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

export default function DutyCycleSection({ settings, update, showInfo }: Props) {
  const { t } = useTranslation();

  return (
    <div className="adv-sectioncontainer adv-basic-card">
      <div className="adv-card-header">
        <span className="adv-card-title">{t("advanced.dutyCycle")}</span>
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
      {showInfo ? <p className="adv-desc">{t("advanced.dutyCycleDescription")}</p> : null}
    </div>
  );
}