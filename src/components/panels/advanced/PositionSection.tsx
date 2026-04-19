import { useState } from "react";
import type { Settings } from "../../../store";
import { useTranslation } from "../../../i18n";
import { SETTINGS_LIMITS } from "../../../settingsSchema";
import UnavailableReason from "../../UnavailableReason";
import { Disableable, NumInput, ToggleBtn, CardDivider } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
  onPickPosition: () => Promise<void>;
}

export default function PositionSection({ settings, update, showInfo, onPickPosition }: Props) {
  const { t } = useTranslation();
  const [pickingPosition, setPickingPosition] = useState(false);
  const [pickCountdown, setPickCountdown] = useState<number | null>(null);

  const pickPositionDisabledReason = pickingPosition
    ? pickCountdown
      ? t(
          pickCountdown === 1
            ? "advanced.pickCountdownSingularUnavailable"
            : "advanced.pickCountdownUnavailable",
          { seconds: pickCountdown },
        )
      : t("advanced.pickInProgressUnavailable")
    : undefined;

  const handlePickPosition = async () => {
    setPickingPosition(true);
    try {
      for (let seconds = 3; seconds > 0; seconds -= 1) {
        setPickCountdown(seconds);
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
      setPickCountdown(null);
      await onPickPosition();
    } finally {
      setPickCountdown(null);
      setPickingPosition(false);
    }
  };

  return (
    <div className="adv-sectioncontainer">
      <div className="adv-card-header">
        <span className="adv-card-title">{t("advanced.position")}</span>
        <ToggleBtn
          value={settings.positionEnabled}
          onChange={(v) =>
            update({
              positionEnabled: v,
              sequenceEnabled: v ? false : settings.sequenceEnabled,
            })
          }
        />
      </div>
      <CardDivider />
      <Disableable
        enabled={settings.positionEnabled}
        disabledReason={t("advanced.positionUnavailable")}
      >
        <div className="adv-row" style={{ marginTop: 8, gap: 6 }}>
          {showInfo && (
            <p className="adv-desc">
              {t("advanced.positionDescription")}
            </p>
          )}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "center",
              }}
            >
              <div
                className="adv-numbox-sm"
                style={{ minWidth: "70px", maxWidth: "70px" }}
              >
                <span
                  className="adv-unit"
                  style={{ marginLeft: 0, marginRight: 4 }}
                >
                  X
                </span>
                <NumInput
                  value={settings.positionX}
                  onChange={(v) => update({ positionX: v })}
                  min={SETTINGS_LIMITS.position.min}
                  style={{ width: "37px" }}
                />
              </div>
              <div
                className="adv-numbox-sm"
                style={{ minWidth: "70px", maxWidth: "70px" }}
              >
                <span
                  className="adv-unit"
                  style={{ marginLeft: 0, marginRight: 4 }}
                >
                  Y
                </span>
                <NumInput
                  value={settings.positionY}
                  onChange={(v) => update({ positionY: v })}
                  min={SETTINGS_LIMITS.position.min}
                  style={{ width: "37px" }}
                />
              </div>
            </div>
            <UnavailableReason reason={pickPositionDisabledReason}>
              <button
                className="adv-pick-btn"
                onClick={handlePickPosition}
                disabled={pickingPosition}
              >
                {pickCountdown
                  ? t("advanced.pickingIn", { seconds: pickCountdown })
                  : pickingPosition
                    ? t("advanced.picking")
                    : t("advanced.pick")}
              </button>
            </UnavailableReason>
          </div>
        </div>
      </Disableable>
    </div>
  );
}