import { useCallback, useEffect, useRef, useState } from "react";
import type { Settings } from "../../../store";
import { useTranslation } from "../../../i18n";
import { invoke } from "@tauri-apps/api/core";
import {
  Disableable,
  NumInput,
  ToggleBtn,
  CardDivider,
  InfoIcon,
} from "../advanced/shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

interface CursorPoint {
  x: number;
  y: number;
}

type PendingCapture = "topLeft" | "bottomRight";

export default function CustomStopZoneSection({
  settings,
  update,
  showInfo,
}: Props) {
  const { t } = useTranslation();
  const [capturingCursor, setCapturingCursor] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pendingCapture, setPendingCapture] = useState<PendingCapture | null>(
    null,
  );
  const pendingCaptureRef = useRef<PendingCapture | null>(null);
  const latestZoneRef = useRef({
    x: settings.customStopZoneX,
    y: settings.customStopZoneY,
  });

  const requestCursorPosition = useCallback(async (): Promise<CursorPoint> => {
    setCapturingCursor(true);
    try {
      return await invoke<CursorPoint>("pick_position");
    } finally {
      setCapturingCursor(false);
    }
  }, []);

  useEffect(() => {
    latestZoneRef.current = {
      x: settings.customStopZoneX,
      y: settings.customStopZoneY,
    };
  }, [settings.customStopZoneX, settings.customStopZoneY]);

  useEffect(() => {
    if (countdown === null || countdown < 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    if (countdown !== 0) return;

    const captureAfterCountdown = async () => {
      const action = pendingCaptureRef.current;
      if (action === null) {
        return;
      }

      try {
        const point = await requestCursorPosition();

        if (action === "topLeft") {
          update({
            customStopZoneX: point.x,
            customStopZoneY: point.y,
          });
          return;
        }

        const { x, y } = latestZoneRef.current;
        const left = Math.min(x, point.x);
        const top = Math.min(y, point.y);
        const right = Math.max(x, point.x);
        const bottom = Math.max(y, point.y);

        update({
          customStopZoneX: left,
          customStopZoneY: top,
          customStopZoneWidth: right - left + 1,
          customStopZoneHeight: bottom - top + 1,
        });
      } finally {
        pendingCaptureRef.current = null;
        setCountdown(null);
        setPendingCapture(null);
      }
    };

    void captureAfterCountdown();
  }, [countdown, requestCursorPosition, update]);

  const setCustomStopZoneTopLeft = () => {
    pendingCaptureRef.current = "topLeft";
    setPendingCapture("topLeft");
    setCountdown(4);
  };

  const setCustomStopZoneBottomRight = () => {
    pendingCaptureRef.current = "bottomRight";
    setPendingCapture("bottomRight");
    setCountdown(4);
  };

  return (
    <div className="adv-sectioncontainer">
      <div className="adv-card-header">
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {showInfo ? (
            <InfoIcon text={t("advanced.customStopZoneDescription")} />
          ) : null}
          <span className="adv-card-title">{t("advanced.customStopZone")}</span>
        </div>
        <ToggleBtn
          value={settings.customStopZoneEnabled}
          onChange={(v) => update({ customStopZoneEnabled: v })}
        />
      </div>
      <CardDivider />
      <Disableable enabled={settings.customStopZoneEnabled}>
        <div className="adv-stop-zone-body">
          <div className="adv-stop-zone-controls">
            <div className="adv-stop-zone-grid">
              <div className="adv-numbox-sm adv-sequence-coord adv-stop-zone-input">
                <span className="adv-unit adv-axis-label">X</span>
                <NumInput
                  value={settings.customStopZoneX}
                  onChange={(v) => update({ customStopZoneX: v })}
                  style={{ width: "54px", textAlign: "right" }}
                />
              </div>
              <div className="adv-numbox-sm adv-sequence-coord adv-stop-zone-input">
                <span className="adv-unit adv-axis-label">Y</span>
                <NumInput
                  value={settings.customStopZoneY}
                  onChange={(v) => update({ customStopZoneY: v })}
                  style={{ width: "54px", textAlign: "right" }}
                />
              </div>
              <div className="adv-numbox-sm adv-sequence-coord adv-stop-zone-input">
                <span className="adv-unit">W</span>
                <NumInput
                  value={settings.customStopZoneWidth}
                  onChange={(v) => update({ customStopZoneWidth: v })}
                  min={1}
                  style={{ width: "54px", textAlign: "right" }}
                />
              </div>
              <div className="adv-numbox-sm adv-sequence-coord adv-stop-zone-input">
                <span className="adv-unit">H</span>
                <NumInput
                  value={settings.customStopZoneHeight}
                  onChange={(v) => update({ customStopZoneHeight: v })}
                  min={1}
                  style={{ width: "54px", textAlign: "right" }}
                />
              </div>
            </div>
            <div className="adv-sequence-actions adv-stop-zone-actions">
              <button
                type="button"
                className="adv-secondary-btn"
                onClick={() => {
                  setCustomStopZoneTopLeft();
                }}
                disabled={capturingCursor || countdown !== null}
              >
                {pendingCapture === "topLeft" && countdown !== null
                  ? countdown === 0
                    ? t("advanced.customStopZoneCapturing")
                    : `${t("advanced.customStopZoneAddingIn")} ${countdown}...`
                  : t("advanced.customStopZoneSetTopLeft")}
              </button>
              <button
                type="button"
                className="adv-secondary-btn"
                onClick={() => {
                  setCustomStopZoneBottomRight();
                }}
                disabled={capturingCursor || countdown !== null}
              >
                {pendingCapture === "bottomRight" && countdown !== null
                  ? countdown === 0
                    ? t("advanced.customStopZoneCapturing")
                    : `${t("advanced.customStopZoneAddingIn")} ${countdown}...`
                  : t("advanced.customStopZoneSetBottomRight")}
              </button>
            </div>
          </div>
        </div>
      </Disableable>
    </div>
  );
}
