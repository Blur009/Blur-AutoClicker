import type { Settings } from "../../../store";
import { useTranslation } from "../../../i18n";
import { getEffectiveClicksPerSecond, getMaxDoubleClickDelayMs } from "../../../cadence";
import { Disableable, NumInput, ToggleBtn } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

function formatClicksPerSecond(value: number): string {
  if (value >= 10) {
    return value.toFixed(value % 1 === 0 ? 0 : 1);
  }
  if (value >= 1) {
    return value.toFixed(2).replace(/\.?0+$/, "");
  }
  return value.toFixed(3).replace(/\.?0+$/, "");
}

export default function DoubleClickSection({ settings, update, showInfo }: Props) {
  const { t } = useTranslation();

  const currentClicksPerSecond = getEffectiveClicksPerSecond({
    clickInterval: settings.clickInterval,
    clickSpeed: settings.clickSpeed,
    rateInputMode: settings.rateInputMode,
    durationMinutes: settings.durationMinutes,
    durationSeconds: settings.durationSeconds,
    durationMilliseconds: settings.durationMilliseconds,
  });

  const doubleClickDisabled = getMaxDoubleClickDelayMs(settings) <= 20;
  const doubleClickDisabledReason = doubleClickDisabled
    ? t("advanced.doubleClickUnavailable", {
        cps: formatClicksPerSecond(currentClicksPerSecond),
      })
    : undefined;

  return (
    <div className="adv-sectioncontainer adv-basic-card">
      <div className="adv-card-header">
        <span className="adv-card-title">
          {t("advanced.doubleClick")}
        </span>
        <div className="adv-row" style={{ gap: 8 }}>
          <Disableable enabled={settings.doubleClickEnabled}>
            <div className="adv-numbox-sm">
              <NumInput
                value={settings.doubleClickDelay}
                onChange={(v) => update({ doubleClickDelay: v })}
                min={20}
                max={getMaxDoubleClickDelayMs(settings)}
              />
              <span className="adv-unit">ms</span>
            </div>
          </Disableable>
          <ToggleBtn
            value={settings.doubleClickEnabled}
            onChange={(v) => update({ doubleClickEnabled: v })}
            disabled={doubleClickDisabled}
            disabledReason={doubleClickDisabledReason}
          />
        </div>
      </div>
      <Disableable
        enabled={settings.doubleClickEnabled}
        disabledReason={t("advanced.doubleClickContentUnavailable")}
      >
        {showInfo ? <p className="adv-desc">{t("advanced.doubleClickDescription")}</p> : null}
      </Disableable>
    </div>
  );
}