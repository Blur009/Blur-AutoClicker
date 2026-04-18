import "./Modes.css";
import { invoke } from "@tauri-apps/api/core";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
} from "react";
import {
  getEffectiveClicksPerSecond,
  getMaxDoubleClickDelayMs,
} from "../../cadence";
import { normalizeIntegerRaw } from "../../numberInput";
import type { SequencePoint, Settings } from "../../store";
import { useTranslation, type TranslationKey } from "../../i18n";
import CadenceInput from "../CadenceInput";
import {
  MOUSE_BUTTON_OPTIONS,
  SETTINGS_LIMITS,
  TIME_LIMIT_UNIT_OPTIONS,
} from "../../settingsSchema";
import HotkeyCaptureInput from "../HotkeyCaptureInput";
import UnavailableReason from "../UnavailableReason";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  onPickPosition: () => Promise<void>;
  compact: boolean;
  showExplanations: boolean;
}

interface CursorPoint {
  x: number;
  y: number;
}

function ToggleBtn({
  value,
  onChange,
  disabled = false,
  disabledReason,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (disabled && value) {
      onChange(false);
    }
  }, [disabled, value, onChange]);

  const group = (
    <div className="adv-toggle-group">
      <button
        className={`adv-toggle-btn ${!value ? "active" : ""} ${disabled ? "disabled" : ""}`}
        onClick={() => !disabled && onChange(false)}
        disabled={disabled}
      >
        {t("common.off")}
      </button>
      <button
        className={`adv-toggle-btn ${value ? "active" : ""} ${disabled ? "disabled" : ""}`}
        onClick={() => !disabled && onChange(true)}
        disabled={disabled}
      >
        {t("common.on")}
      </button>
    </div>
  );

  return disabled ? (
    <UnavailableReason reason={disabledReason}>{group}</UnavailableReason>
  ) : (
    group
  );
}

function Disableable({
  enabled,
  disabledReason,
  children,
}: {
  enabled: boolean;
  disabledReason?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  const content = (
    <div className="disabled-container">
      <div className={enabled ? "" : "disabled-content"}>{children}</div>
      {!enabled && (
        <div className="disabled-overlay">
          <span className="disabled-label">{t("common.disabled")}</span>
        </div>
      )}
    </div>
  );

  return enabled ? (
    content
  ) : (
    <UnavailableReason
      reason={disabledReason}
      className="unavailable-reason--block"
    >
      {content}
    </UnavailableReason>
  );
}

function NumInput({
  value,
  onChange,
  min,
  max,
  style,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLInputElement>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = normalizeIntegerRaw(e.target.value);
    if (raw !== e.target.value) {
      e.target.value = raw;
    }
    const val = raw === "" || raw === "-" ? 0 : Number(raw);
    onChange(val);
  };

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    const raw = normalizeIntegerRaw(e.target.value);
    if (raw !== e.target.value) {
      e.target.value = raw;
    }
    let val = Number(raw || e.target.value);
    if (Number.isNaN(val)) val = min ?? 0;
    if (min !== undefined && val < min) val = min;
    if (max !== undefined && val > max) val = max;
    onChange(val);
  };

  return (
    <input
      ref={ref}
      type="number"
      className="adv-number-sm"
      value={value}
      min={min}
      max={max}
      onChange={handleChange}
      onBlur={handleBlur}
      style={{
        background: "transparent",
        border: "none",
        outline: "none",
        width: "36px",
        ...style,
      }}
    />
  );
}

function CardDivider() {
  return <div className="adv-card-divider" />;
}

function ActionButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="adv-secondary-btn"
      onClick={() => {
        void onClick();
      }}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

const CORNER_KEYS = {
  tl: "cornerStopTL",
  tr: "cornerStopTR",
  bl: "cornerStopBL",
  br: "cornerStopBR",
} as const;

const EDGE_KEYS = {
  top: "edgeStopTop",
  right: "edgeStopRight",
  left: "edgeStopLeft",
  bottom: "edgeStopBottom",
} as const;

function formatClicksPerSecond(value: number): string {
  if (value >= 10) {
    return value.toFixed(value % 1 === 0 ? 0 : 1);
  }

  if (value >= 1) {
    return value.toFixed(2).replace(/\.?0+$/, "");
  }

  return value.toFixed(3).replace(/\.?0+$/, "");
}


export default function AdvancedPanelLayout({
  settings,
  update,
  onPickPosition,
  compact,
  showExplanations,
}: Props) {
  const { t } = useTranslation();
  const [pickingPosition, setPickingPosition] = useState(false);
  const [pickCountdown, setPickCountdown] = useState<number | null>(null);
  const [capturingCursor, setCapturingCursor] = useState(false);
  const rowSpacing = compact ? 6 : 8;
  const cardBodyClass = `adv-card-body ${compact ? "adv-card-body-compact" : ""}`;
  const featureBodyClass = `adv-feature-body ${compact ? "adv-feature-body-compact" : ""}`;
  const {
    clickInterval,
    clickSpeed,
    doubleClickDelay,
    durationMilliseconds,
    durationMinutes,
    durationSeconds,
    rateInputMode,
  } = settings;
  const clampDoubleClickDelay = useEffectEvent((maxDelay: number) => {
    update({ doubleClickDelay: maxDelay });
  });

  useEffect(() => {
    const max = getMaxDoubleClickDelayMs({
      clickInterval,
      clickSpeed,
      rateInputMode,
      durationMinutes,
      durationSeconds,
      durationMilliseconds,
    });
    if (doubleClickDelay > max) {
      clampDoubleClickDelay(max);
    }
  }, [
    clickInterval,
    clickSpeed,
    doubleClickDelay,
    durationMilliseconds,
    durationMinutes,
    durationSeconds,
    rateInputMode,
  ]);

  const showDesc = (key: TranslationKey) =>
    showExplanations ? <p className="adv-desc">{t(key)}</p> : null;
  const currentClicksPerSecond = getEffectiveClicksPerSecond({
    clickInterval,
    clickSpeed,
    rateInputMode,
    durationMinutes,
    durationSeconds,
    durationMilliseconds,
  });
  const doubleClickDisabled = getMaxDoubleClickDelayMs(settings) <= 20;
  const doubleClickDisabledReason = doubleClickDisabled
    ? t("advanced.doubleClickUnavailable", { cps: formatClicksPerSecond(currentClicksPerSecond) })
    : undefined;
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

  const requestCursorPosition = async (): Promise<CursorPoint> => {
    setCapturingCursor(true);
    try {
      return await invoke<CursorPoint>("pick_position");
    } finally {
      setCapturingCursor(false);
    }
  };

  const updateSequencePoint = (
    index: number,
    patch: Partial<SequencePoint>,
  ) => {
    const nextPoints = settings.sequencePoints.map((point, pointIndex) =>
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
      (_, pointIndex) => pointIndex !== index,
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

  const setCustomStopZoneTopLeft = async () => {
    const point = await requestCursorPosition();
    update({
      customStopZoneX: point.x,
      customStopZoneY: point.y,
    });
  };

  const setCustomStopZoneBottomRight = async () => {
    const point = await requestCursorPosition();
    const left = Math.min(settings.customStopZoneX, point.x);
    const top = Math.min(settings.customStopZoneY, point.y);
    const right = Math.max(settings.customStopZoneX, point.x);
    const bottom = Math.max(settings.customStopZoneY, point.y);

    update({
      customStopZoneX: left,
      customStopZoneY: top,
      customStopZoneWidth: right - left + 1,
      customStopZoneHeight: bottom - top + 1,
    });
  };

  const renderSequencePoints = () => (
    <div className="adv-sequence-list">
      {settings.sequencePoints.length === 0 ? (
        <div className="adv-sequence-empty">{t("advanced.sequenceEmpty")}</div>
      ) : (
        settings.sequencePoints.map((point, index) => (
          <div key={`${index}:${point.x}:${point.y}`} className="adv-sequence-item">
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
              <ActionButton onClick={() => moveSequencePoint(index, -1)} disabled={index === 0}>
                {t("advanced.sequenceMoveUp")}
              </ActionButton>
              <ActionButton
                onClick={() => moveSequencePoint(index, 1)}
                disabled={index === settings.sequencePoints.length - 1}
              >
                {t("advanced.sequenceMoveDown")}
              </ActionButton>
              <ActionButton onClick={() => deleteSequencePoint(index)}>
                {t("advanced.sequenceDelete")}
              </ActionButton>
            </div>
          </div>
        ))
      )}
    </div>
  );

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

  if (!compact) {
    return (
      <div className="advanced-panel advanced-panel-text">
        <div className="advanced-columns">
          <div className="advanced-col">
            <div className="sectioncontainer adv-basic-card">
              <CadenceInput settings={settings} update={update} variant="advanced" />
              <div className="adv-row" style={{ marginTop: rowSpacing }}>
                <span className="adv-label">{t("advanced.hotkey")}</span>
                <div className="adv-textbox">
                  <HotkeyCaptureInput
                    className="adv-textbox-text"
                    value={settings.hotkey}
                    onChange={(hotkey) => update({ hotkey })}
                    style={{
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      width: "150px",
                    }}
                  />
                </div>
                <div className="simple-seg-group">
                  {(["Toggle", "Hold"] as const).map((clickModeOption) => (
                    <button
                      key={clickModeOption}
                      className={`simple-seg-btn ${settings.mode === clickModeOption ? "active" : ""}`}
                      onClick={() => update({ mode: clickModeOption })}
                    >
                      {t(`options.mode.${clickModeOption}` as TranslationKey)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="adv-row" style={{ marginTop: rowSpacing }}>
                <span className="adv-label">{t("advanced.mouseButton")}</span>
                <div className="simple-seg-group">
                  {MOUSE_BUTTON_OPTIONS.map((mouseButtonOption) => (
                    <button
                      key={mouseButtonOption}
                      className={`simple-seg-btn ${settings.mouseButton === mouseButtonOption ? "active" : ""}`}
                      onClick={() => update({ mouseButton: mouseButtonOption })}
                    >
                      {t(`options.mouseButton.${mouseButtonOption}` as TranslationKey)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="sectioncontainer adv-basic-card">
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
              {showDesc("advanced.dutyCycleDescription")}
            </div>

            <div className="sectioncontainer adv-basic-card">
              <div className="adv-card-header">
                <span className="adv-card-title">{t("advanced.speedVariation")}</span>
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
                {showDesc("advanced.speedVariationDescription")}
              </Disableable>
            </div>

            <div className="sectioncontainer adv-basic-card">
              <div className="adv-card-header">
                <span className="adv-card-title">{t("advanced.doubleClick")}</span>
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
                {showDesc("advanced.doubleClickDescription")}
              </Disableable>
            </div>

            <div className="sectioncontainer">
              <div className="adv-card-header">
                <span className="adv-card-title">{t("advanced.sequenceClicking")}</span>
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
                  {showExplanations && (
                    <p className="adv-desc">
                      {t("advanced.sequenceClickingDescription")}
                    </p>
                  )}
                  <div className="adv-sequence-controls">
                    <div className="adv-sequence-toolbar">
                      <ActionButton
                        onClick={addCurrentCursorToSequence}
                        disabled={capturingCursor}
                      >
                        {t("advanced.sequenceAddCurrentCursor")}
                      </ActionButton>
                    </div>
                    {renderSequencePoints()}
                  </div>
                </div>
              </Disableable>
            </div>
          </div>

          <div className="advanced-col">
            <div className="sectioncontainer adv-limits-card">
              <div
                className="adv-row"
                style={{ justifyContent: "space-between" }}
              >
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
              <div
                className="adv-row"
                style={{ justifyContent: "space-between" }}
              >
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
                      <div className="simple-seg-group">
                        {TIME_LIMIT_UNIT_OPTIONS.map((timeLimitUnitOption) => (
                          <button
                            key={timeLimitUnitOption}
                            className={`simple-seg-btn ${settings.timeLimitUnit === timeLimitUnitOption ? "active" : ""}`}
                            onClick={() => update({ timeLimitUnit: timeLimitUnitOption })}
                          >
                            {t(`options.timeUnitShort.${timeLimitUnitOption}` as TranslationKey)}
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

            <div className="sectioncontainer">
              <div className="adv-card-header">
                <span className="adv-card-title">{t("advanced.cornerStop")}</span>
                <ToggleBtn
                  value={settings.cornerStopEnabled}
                  onChange={(v) => {
                    update({ cornerStopEnabled: v });
                  }}
                />
              </div>
              <CardDivider />
              <Disableable
                enabled={settings.cornerStopEnabled}
                disabledReason={t("advanced.cornerStopUnavailable")}
              >
                <div className="adv-row" style={{ gap: 8 }}>
                  {showExplanations && (
                    <p className="adv-desc">
                      {t("advanced.cornerStopDescription")}
                    </p>
                  )}
                  <div className="adv-corner-grid">
                    {(["tl", "tr", "bl", "br"] as const).map((cornerKey) => (
                      <div key={cornerKey} className="adv-corner-box">
                        <div className={`adv-arc adv-arc-${cornerKey}`} />
                        <NumInput
                          value={settings[CORNER_KEYS[cornerKey]]}
                          onChange={(v) => {
                            update({ [CORNER_KEYS[cornerKey]]: v });
                          }}
                          min={SETTINGS_LIMITS.stopBoundary.min}
                          max={SETTINGS_LIMITS.stopBoundary.max}
                          style={{ width: "28px", textAlign: "right" }}
                        />
                        <span className="adv-unit">px</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Disableable>
            </div>

            <div className="sectioncontainer">
              <div className="adv-card-header">
                <span className="adv-card-title">{t("advanced.edgeStop")}</span>
                <ToggleBtn
                  value={settings.edgeStopEnabled}
                  onChange={(v) => {
                    update({ edgeStopEnabled: v });
                  }}
                />
              </div>
              <CardDivider />
              <Disableable
                enabled={settings.edgeStopEnabled}
                disabledReason={t("advanced.edgeStopUnavailable")}
              >
                <div className="adv-row" style={{ gap: 8 }}>
                  {showExplanations && (
                    <p className="adv-desc">
                      {t("advanced.edgeStopDescription")}
                    </p>
                  )}
                  <div className="adv-corner-grid">
                    {(["top", "right", "left", "bottom"] as const).map((edgeSide) => (
                      <div key={edgeSide} className="adv-corner-box">
                        <div className={`adv-edge-bar adv-edge-bar-${edgeSide}`} />
                        <NumInput
                          value={settings[EDGE_KEYS[edgeSide]]}
                          onChange={(v) => {
                            update({ [EDGE_KEYS[edgeSide]]: v });
                          }}
                          min={SETTINGS_LIMITS.stopBoundary.min}
                          max={SETTINGS_LIMITS.stopBoundary.max}
                          style={{ width: "28px", textAlign: "right" }}
                        />
                        <span className="adv-unit">px</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Disableable>
            </div>

            <div className="sectioncontainer">
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
                  {showExplanations && (
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

            <div className="sectioncontainer">
              <div className="adv-card-header">
                <span className="adv-card-title">{t("advanced.customStopZone")}</span>
                <ToggleBtn
                  value={settings.customStopZoneEnabled}
                  onChange={(v) => update({ customStopZoneEnabled: v })}
                />
              </div>
              <CardDivider />
              <Disableable enabled={settings.customStopZoneEnabled}>
                <div className="adv-stop-zone-body">
                  {showExplanations && (
                    <p className="adv-desc">
                      {t("advanced.customStopZoneDescription")}
                    </p>
                  )}
                  <div className="adv-stop-zone-controls">
                    <div className="adv-stop-zone-grid">
                      <div className="adv-numbox-sm adv-sequence-coord">
                        <span className="adv-unit adv-axis-label">X</span>
                        <NumInput
                          value={settings.customStopZoneX}
                          onChange={(v) => update({ customStopZoneX: v })}
                          style={{ width: "54px", textAlign: "right" }}
                        />
                      </div>
                      <div className="adv-numbox-sm adv-sequence-coord">
                        <span className="adv-unit adv-axis-label">Y</span>
                        <NumInput
                          value={settings.customStopZoneY}
                          onChange={(v) => update({ customStopZoneY: v })}
                          style={{ width: "54px", textAlign: "right" }}
                        />
                      </div>
                      <div className="adv-numbox-sm adv-sequence-coord">
                        <span className="adv-unit">W</span>
                        <NumInput
                          value={settings.customStopZoneWidth}
                          onChange={(v) => update({ customStopZoneWidth: v })}
                          min={1}
                          style={{ width: "54px", textAlign: "right" }}
                        />
                      </div>
                      <div className="adv-numbox-sm adv-sequence-coord">
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
                      <ActionButton
                        onClick={setCustomStopZoneTopLeft}
                        disabled={capturingCursor}
                      >
                        {t("advanced.customStopZoneSetTopLeft")}
                      </ActionButton>
                      <ActionButton
                        onClick={setCustomStopZoneBottomRight}
                        disabled={capturingCursor}
                      >
                        {t("advanced.customStopZoneSetBottomRight")}
                      </ActionButton>
                    </div>
                  </div>
                </div>
              </Disableable>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="advanced-panel advanced-panel-compact">
      <div className="adv-compact-stack">
        <div className="adv-compact-top">
          <div className="sectioncontainer adv-basic-card">
            <CadenceInput settings={settings} update={update} variant="advanced" />
            <div className="adv-row" style={{ marginTop: rowSpacing }}>
              <span className="adv-label">{t("advanced.hotkey")}</span>
              <div className="adv-textbox">
                <HotkeyCaptureInput
                  className="adv-textbox-text"
                  value={settings.hotkey}
                  onChange={(hotkey) => update({ hotkey })}
                  style={{
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    width: "150px",
                  }}
                />
              </div>
              <div className="simple-seg-group">
                {(["Toggle", "Hold"] as const).map((clickModeOption) => (
                  <button
                    key={clickModeOption}
                    className={`simple-seg-btn ${settings.mode === clickModeOption ? "active" : ""}`}
                    onClick={() => update({ mode: clickModeOption })}
                  >
                    {t(`options.mode.${clickModeOption}` as TranslationKey)}
                  </button>
                ))}
              </div>
            </div>
            <div className="adv-row" style={{ marginTop: rowSpacing }}>
              <span className="adv-label">{t("advanced.mouseButton")}</span>
              <div className="simple-seg-group">
                {MOUSE_BUTTON_OPTIONS.map((mouseButtonOption) => (
                  <button
                    key={mouseButtonOption}
                    className={`simple-seg-btn ${settings.mouseButton === mouseButtonOption ? "active" : ""}`}
                    onClick={() => update({ mouseButton: mouseButtonOption })}
                  >
                    {t(`options.mouseButton.${mouseButtonOption}` as TranslationKey)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="sectioncontainer adv-compact-card">
            <div className="adv-card-title">{t("advanced.doubleClick")}</div>
            <CardDivider />
            <div className="adv-limit-block">
              <div className="adv-card-header">
                <span className="adv-label">{t("common.enabled")}</span>
                <ToggleBtn
                  value={settings.doubleClickEnabled}
                  onChange={(v) => update({ doubleClickEnabled: v })}
                  disabled={doubleClickDisabled}
                  disabledReason={doubleClickDisabledReason}
                />
              </div>
              <Disableable
                enabled={settings.doubleClickEnabled}
                disabledReason={t("advanced.doubleClickContentUnavailable")}
              >
                <div className={cardBodyClass}>
                  <div className="adv-inline-controls adv-inline-controls-start">
                    <div className="adv-numbox-sm">
                      <NumInput
                        value={settings.doubleClickDelay}
                        onChange={(v) => update({ doubleClickDelay: v })}
                        min={20}
                        max={getMaxDoubleClickDelayMs(settings)}
                      />
                      <span className="adv-unit">ms</span>
                    </div>
                    <span className="adv-label-sm">{t("advanced.delay")}</span>
                  </div>
                </div>
              </Disableable>
            </div>
          </div>
        </div>

        <div className="adv-compact-grid">
          <div className="sectioncontainer adv-compact-card adv-compact-card-wide">
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
              <div className={featureBodyClass}>
                <div className="adv-inline-controls adv-inline-controls-start adv-position-inline">
                  <div
                    className="adv-numbox-sm"
                    style={{ minWidth: "64px", maxWidth: "64px" }}
                  >
                    <span className="adv-unit adv-axis-label">X</span>
                    <NumInput
                      value={settings.positionX}
                      onChange={(v) => update({ positionX: v })}
                      min={SETTINGS_LIMITS.position.min}
                      style={{ width: "32px" }}
                    />
                  </div>
                  <div
                    className="adv-numbox-sm"
                    style={{ minWidth: "64px", maxWidth: "64px" }}
                  >
                    <span className="adv-unit adv-axis-label">Y</span>
                    <NumInput
                      value={settings.positionY}
                      onChange={(v) => update({ positionY: v })}
                      min={SETTINGS_LIMITS.position.min}
                      style={{ width: "32px" }}
                    />
                  </div>
                  <UnavailableReason reason={pickPositionDisabledReason}>
                    <button
                      className="adv-pick-btn adv-pick-btn-inline"
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

          <div className="sectioncontainer adv-compact-card adv-compact-card-wide">
            <div className="adv-card-header">
              <span className="adv-card-title">{t("advanced.sequenceClicking")}</span>
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
              <div className="adv-sequence-controls">
                <div className="adv-sequence-toolbar">
                  <ActionButton
                    onClick={addCurrentCursorToSequence}
                    disabled={capturingCursor}
                  >
                    {t("advanced.sequenceAddCurrentCursor")}
                  </ActionButton>
                </div>
                {renderSequencePoints()}
              </div>
            </Disableable>
          </div>

          <div className="sectioncontainer adv-compact-card adv-compact-card-wide">
            <div className="adv-card-header">
              <span className="adv-card-title">{t("advanced.customStopZone")}</span>
              <ToggleBtn
                value={settings.customStopZoneEnabled}
                onChange={(v) => update({ customStopZoneEnabled: v })}
              />
            </div>
            <CardDivider />
            <Disableable enabled={settings.customStopZoneEnabled}>
              <div className="adv-stop-zone-controls">
                <div className="adv-stop-zone-grid">
                  <div className="adv-numbox-sm adv-sequence-coord">
                    <span className="adv-unit adv-axis-label">X</span>
                    <NumInput
                      value={settings.customStopZoneX}
                      onChange={(v) => update({ customStopZoneX: v })}
                      style={{ width: "46px", textAlign: "right" }}
                    />
                  </div>
                  <div className="adv-numbox-sm adv-sequence-coord">
                    <span className="adv-unit adv-axis-label">Y</span>
                    <NumInput
                      value={settings.customStopZoneY}
                      onChange={(v) => update({ customStopZoneY: v })}
                      style={{ width: "46px", textAlign: "right" }}
                    />
                  </div>
                  <div className="adv-numbox-sm adv-sequence-coord">
                    <span className="adv-unit">W</span>
                    <NumInput
                      value={settings.customStopZoneWidth}
                      onChange={(v) => update({ customStopZoneWidth: v })}
                      min={1}
                      style={{ width: "46px", textAlign: "right" }}
                    />
                  </div>
                  <div className="adv-numbox-sm adv-sequence-coord">
                    <span className="adv-unit">H</span>
                    <NumInput
                      value={settings.customStopZoneHeight}
                      onChange={(v) => update({ customStopZoneHeight: v })}
                      min={1}
                      style={{ width: "46px", textAlign: "right" }}
                    />
                  </div>
                </div>
                <div className="adv-sequence-actions adv-stop-zone-actions">
                  <ActionButton
                    onClick={setCustomStopZoneTopLeft}
                    disabled={capturingCursor}
                  >
                    {t("advanced.customStopZoneSetTopLeft")}
                  </ActionButton>
                  <ActionButton
                    onClick={setCustomStopZoneBottomRight}
                    disabled={capturingCursor}
                  >
                    {t("advanced.customStopZoneSetBottomRight")}
                  </ActionButton>
                </div>
              </div>
            </Disableable>
          </div>

          <div className="adv-compact-three-grid">
            <div className="sectioncontainer adv-compact-card">
              <div className="adv-card-header">
                <span className="adv-card-title">{t("advanced.clickLimit")}</span>
                <ToggleBtn
                  value={settings.clickLimitEnabled}
                  onChange={(v) => update({ clickLimitEnabled: v })}
                />
              </div>
              <CardDivider />
              <Disableable
                enabled={settings.clickLimitEnabled}
                disabledReason={t("advanced.clickLimitUnavailable")}
              >
                <div className={cardBodyClass}>
                  <div className="adv-inline-controls adv-inline-controls-start adv-limit-inputs">
                    <div className="adv-numbox-sm">
                      <NumInput
                        value={settings.clickLimit}
                        onChange={(v) => update({ clickLimit: v })}
                        min={SETTINGS_LIMITS.clickLimit.min}
                        max={SETTINGS_LIMITS.clickLimit.max}
                        style={{ width: "72px", textAlign: "right" }}
                      />
                      <span className="adv-unit">{t("advanced.clicksUnit")}</span>
                    </div>
                  </div>
                </div>
              </Disableable>
            </div>

            <div className="sectioncontainer adv-compact-card">
              <div className="adv-card-header">
                <span className="adv-card-title">{t("advanced.timeLimit")}</span>
                <ToggleBtn
                  value={settings.timeLimitEnabled}
                  onChange={(v) => update({ timeLimitEnabled: v })}
                />
              </div>
              <CardDivider />
              <Disableable
                enabled={settings.timeLimitEnabled}
                disabledReason={t("advanced.timeLimitUnavailable")}
              >
                <div className={cardBodyClass}>
                  <div className="adv-inline-controls adv-inline-controls-start adv-limit-inputs">
                    <div className="adv-numbox-sm">
                      <NumInput
                        value={settings.timeLimit}
                        onChange={(v) => update({ timeLimit: v })}
                        min={SETTINGS_LIMITS.timeLimit.min}
                        style={{ width: "32px", textAlign: "right" }}
                      />
                    </div>
                    <div className="simple-seg-group">
                      {TIME_LIMIT_UNIT_OPTIONS.map((timeLimitUnitOption) => (
                        <button
                          key={timeLimitUnitOption}
                          className={`simple-seg-btn ${settings.timeLimitUnit === timeLimitUnitOption ? "active" : ""}`}
                          onClick={() => update({ timeLimitUnit: timeLimitUnitOption })}
                        >
                          {t(`options.timeUnitShort.${timeLimitUnitOption}` as TranslationKey)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Disableable>
            </div>

            <div className="sectioncontainer adv-compact-card">
              <div className="adv-card-header">
                <span className="adv-card-title">{t("advanced.dutyCycle")}</span>
                <ToggleBtn
                  value={settings.dutyCycleEnabled}
                  onChange={(v) => update({ dutyCycleEnabled: v })}
                />
              </div>
              <CardDivider />
              <Disableable
                enabled={settings.dutyCycleEnabled}
                disabledReason={t("advanced.dutyCycleUnavailable")}
              >
                <div className={cardBodyClass}>
                  <div className="adv-inline-controls adv-inline-controls-start">
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
              </Disableable>
            </div>

            <div className="sectioncontainer adv-compact-card">
              <div className="adv-card-header">
                <span className="adv-card-title">
                  {t("advanced.speedVariation")}
                </span>
                <ToggleBtn
                  value={settings.speedVariationEnabled}
                  onChange={(v) => update({ speedVariationEnabled: v })}
                />
              </div>
              <CardDivider />
              <Disableable
                enabled={settings.speedVariationEnabled}
                disabledReason={t("advanced.speedVariationUnavailable")}
              >
                <div className={cardBodyClass}>
                  <div className="adv-inline-controls adv-inline-controls-start">
                    <div className="adv-numbox-sm">
                      <NumInput
                        value={settings.speedVariation}
                        onChange={(v) => update({ speedVariation: v })}
                        min={SETTINGS_LIMITS.speedVariation.min}
                        max={SETTINGS_LIMITS.speedVariation.max}
                      />
                      <span className="adv-unit">%</span>
                    </div>
                  </div>
                </div>
              </Disableable>
            </div>

            <div className="sectioncontainer adv-compact-card">
              <div className="adv-card-header">
                <span className="adv-card-title">{t("advanced.cornerStop")}</span>
                <ToggleBtn
                  value={settings.cornerStopEnabled}
                  onChange={(v) => {
                    update({ cornerStopEnabled: v });
                  }}
                />
              </div>
              <CardDivider />
              <Disableable
                enabled={settings.cornerStopEnabled}
                disabledReason={t("advanced.cornerStopUnavailable")}
              >
                <div className={featureBodyClass}>
                  <div className="adv-corner-grid">
                    {(["tl", "tr", "bl", "br"] as const).map((cornerKey) => (
                      <div key={cornerKey} className="adv-corner-box">
                        <div className={`adv-arc adv-arc-${cornerKey}`} />
                        <NumInput
                          value={settings[CORNER_KEYS[cornerKey]]}
                          onChange={(v) => {
                            update({ [CORNER_KEYS[cornerKey]]: v });
                          }}
                          min={SETTINGS_LIMITS.stopBoundary.min}
                          max={SETTINGS_LIMITS.stopBoundary.max}
                          style={{ width: "28px", textAlign: "right" }}
                        />
                        <span className="adv-unit">px</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Disableable>
            </div>

            <div className="sectioncontainer adv-compact-card">
              <div className="adv-card-header">
                <span className="adv-card-title">{t("advanced.edgeStop")}</span>
                <ToggleBtn
                  value={settings.edgeStopEnabled}
                  onChange={(v) => {
                    update({ edgeStopEnabled: v });
                  }}
                />
              </div>
              <CardDivider />
              <Disableable
                enabled={settings.edgeStopEnabled}
                disabledReason={t("advanced.edgeStopUnavailable")}
              >
                <div className={featureBodyClass}>
                  <div className="adv-corner-grid">
                    {(["top", "right", "left", "bottom"] as const).map((edgeSide) => (
                      <div key={edgeSide} className="adv-corner-box">
                        <div className={`adv-edge-bar adv-edge-bar-${edgeSide}`} />
                        <NumInput
                          value={settings[EDGE_KEYS[edgeSide]]}
                          onChange={(v) => {
                            update({ [EDGE_KEYS[edgeSide]]: v });
                          }}
                          min={SETTINGS_LIMITS.stopBoundary.min}
                          max={SETTINGS_LIMITS.stopBoundary.max}
                          style={{ width: "28px", textAlign: "right" }}
                        />
                        <span className="adv-unit">px</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Disableable>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
