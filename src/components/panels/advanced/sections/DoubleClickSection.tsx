import type { Settings } from "../../../../store";

import {
  getEffectiveClicksPerSecond,
  isDoubleClickSupported,
} from "../../../../cadence";
import { InfoIcon, ToggleBtn } from "./shared";

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

export default function DoubleClickSection({
  settings,
  update,
  showInfo,
}: Props) {
  const currentClicksPerSecond = getEffectiveClicksPerSecond({
    clickInterval: settings.clickInterval,
    clickSpeed: settings.clickSpeed,
    rateInputMode: settings.rateInputMode,
    durationHours: settings.durationHours,
    durationMinutes: settings.durationMinutes,
    durationSeconds: settings.durationSeconds,
    durationMilliseconds: settings.durationMilliseconds,
  });

  const doubleClickDisabled = !isDoubleClickSupported(settings);
  const doubleClickDisabledReason = doubleClickDisabled
    ? `Double Click is unavailable at ${formatClicksPerSecond(currentClicksPerSecond)} clicks/sec. Lower the effective click rate below 50 clicks/sec to turn it on.`
    : undefined;

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
            <InfoIcon text="Clicks twice per cycle using your Windows double-click speed, then keeps the second press held for the configured click duration. Only available under 50cps" />
          ) : null}
          <span className="adv-card-title">Double Click</span>
        </div>
        <div className="adv-row" style={{ gap: 8 }}>
          <ToggleBtn
            value={settings.doubleClickEnabled}
            onChange={(v) => update({ doubleClickEnabled: v })}
            disabled={doubleClickDisabled}
            disabledReason={doubleClickDisabledReason}
          />
        </div>
      </div>
    </div>
  );
}
