import { useState } from "react";
import type { SequencePoint, Settings } from "../../../store";
import { useTranslation } from "../../../i18n";
import { invoke } from "@tauri-apps/api/core";
import { NumInput, Disableable, CardDivider, ToggleBtn } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

interface CursorPoint {
  x: number;
  y: number;
}

export default function SequenceSection({ settings, update, showInfo }: Props) {
  const { t } = useTranslation();
  const [capturingCursor, setCapturingCursor] = useState(false);

  const requestCursorPosition = async (): Promise<CursorPoint> => {
    setCapturingCursor(true);
    try {
      return await invoke<CursorPoint>("pick_position");
    } finally {
      setCapturingCursor(false);
    }
  };

  const updateSequencePoint = (index: number, patch: Partial<SequencePoint>) => {
    const nextPoints = settings.sequencePoints.map((point: SequencePoint, pointIndex: number) =>
      pointIndex === index ? { ...point, ...patch } : point,
    );
    update({ sequencePoints: nextPoints });
  };

  const moveSequencePoint = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= settings.sequencePoints.length) {
      return;
    }
    const nextPoints = [...settings.sequencePoints];
    const [point] = nextPoints.splice(index, 1);
    nextPoints.splice(nextIndex, 0, point);
    update({ sequencePoints: nextPoints });
  };

  const deleteSequencePoint = (index: number) => {
    const nextPoints = settings.sequencePoints.filter(
      (_: SequencePoint, pointIndex: number) => pointIndex !== index,
    );
    update({ sequencePoints: nextPoints });
  };

  const addCurrentCursorToSequence = async () => {
    const point = await requestCursorPosition();
    update({
      positionEnabled: false,
      sequenceEnabled: true,
      sequencePoints: [...settings.sequencePoints, point],
    });
  };

  return (
    <div className="adv-sectioncontainer">
      <div className="adv-card-header">
        <span className="adv-card-title">
          {t("advanced.sequenceClicking")}
        </span>
        <ToggleBtn
          value={settings.sequenceEnabled}
          onChange={(v) =>
            update({
              sequenceEnabled: v,
              positionEnabled: v ? false : settings.positionEnabled,
            })
          }
        />
      </div>
      <CardDivider />
      <Disableable enabled={settings.sequenceEnabled}>
        <div className="adv-sequence-body">
          {showInfo && (
            <p className="adv-desc">
              {t("advanced.sequenceClickingDescription")}
            </p>
          )}
          <div className="adv-sequence-controls">
            <div className="adv-sequence-toolbar">
              <button
                type="button"
                className="adv-secondary-btn"
                onClick={() => { void addCurrentCursorToSequence(); }}
                disabled={capturingCursor}
              >
                {t("advanced.sequenceAddCurrentCursor")}
              </button>
            </div>
            <div className="adv-sequence-list">
              {settings.sequencePoints.length === 0 ? (
                <div className="adv-sequence-empty">{t("advanced.sequenceEmpty")}</div>
              ) : (
                settings.sequencePoints.map((point: SequencePoint, index: number) => (
                  <div
                    key={`${index}:${point.x}:${point.y}`}
                    className="adv-sequence-item"
                  >
                    <span className="adv-sequence-index">{index + 1}</span>
                    <div className="adv-numbox-sm adv-sequence-coord">
                      <span className="adv-unit adv-axis-label">X</span>
                      <NumInput
                        value={point.x}
                        onChange={(value) => updateSequencePoint(index, { x: value })}
                        style={{ width: "54px", textAlign: "right" }}
                      />
                    </div>
                    <div className="adv-numbox-sm adv-sequence-coord">
                      <span className="adv-unit adv-axis-label">Y</span>
                      <NumInput
                        value={point.y}
                        onChange={(value) => updateSequencePoint(index, { y: value })}
                        style={{ width: "54px", textAlign: "right" }}
                      />
                    </div>
                    <div className="adv-sequence-actions">
                      <button
                        type="button"
                        className="adv-secondary-btn"
                        onClick={() => moveSequencePoint(index, -1)}
                        disabled={index === 0}
                      >
                        {t("advanced.sequenceMoveUp")}
                      </button>
                      <button
                        type="button"
                        className="adv-secondary-btn"
                        onClick={() => moveSequencePoint(index, 1)}
                        disabled={index === settings.sequencePoints.length - 1}
                      >
                        {t("advanced.sequenceMoveDown")}
                      </button>
                      <button
                        type="button"
                        className="adv-secondary-btn"
                        onClick={() => deleteSequencePoint(index)}
                      >
                        {t("advanced.sequenceDelete")}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </Disableable>
    </div>
  );
}