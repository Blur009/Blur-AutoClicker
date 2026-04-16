import "./Modes.css";
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
import type { Settings } from "../../store";
import HotkeyCaptureInput from "../HotkeyCaptureInput";
import React from "react";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  onPickPosition: () => Promise<void>;
  compact: boolean;
  showExplanations: boolean;
}

function ToggleBtn({
  value,
  onChange,
  disabled = false,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  React.useEffect(() => {
    if (disabled && value) {
      onChange(false);
    }
  }, [disabled, value, onChange]);

  return (
    <div className="adv-toggle-group">
      <button
        className={`adv-toggle-btn ${!value ? "active" : ""} ${disabled ? "disabled" : ""}`}
        onClick={() => !disabled && onChange(false)}
        disabled={disabled}
      >
        OFF
      </button>
      <button
        className={`adv-toggle-btn ${value ? "active" : ""} ${disabled ? "disabled" : ""}`}
        onClick={() => !disabled && onChange(true)}
        disabled={disabled}
      >
        ON
      </button>
    </div>
  );
}

function Disableable({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return (
    <div className="disabled-container">
      <div className={enabled ? "" : "disabled-content"}>{children}</div>
      {!enabled && (
        <div className="disabled-overlay">
          <span className="disabled-label">Disabled</span>
        </div>
      )}
    </div>
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
    const raw = e.target.value.replace(/^0+(?=\d)/, "");
    if (raw !== e.target.value) {
      e.target.value = raw;
    }
    const val = raw === "" ? 0 : Number(raw);
    onChange(val);
  };

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/^0+(?=\d)/, "");
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

function maxDoubleClickDelayMs(
  clickSpeed: number,
  clickInterval: string,
): number {
  const cps =
    clickInterval === "m"
      ? Math.min(clickSpeed / 60, 50)
      : clickInterval === "h"
        ? Math.min(clickSpeed / 3600, 50)
        : clickInterval === "d"
          ? Math.min(clickSpeed / 86400, 50)
          : Math.min(clickSpeed, 50);
  return cps > 0 ? Math.floor(1000 / cps) - 2 : 9999;
}

export default function AdvancedPanelLayout({
  settings,
  update,
  onPickPosition,
  compact,
  showExplanations,
}: Props) {
  const [pickingPosition, setPickingPosition] = useState(false);
  const [pickCountdown, setPickCountdown] = useState<number | null>(null);
  const rowSpacing = compact ? 6 : 8;
  const cardBodyClass = `adv-card-body ${compact ? "adv-card-body-compact" : ""}`;
  const featureBodyClass = `adv-feature-body ${compact ? "adv-feature-body-compact" : ""}`;
  const clampDoubleClickDelay = useEffectEvent((maxDelay: number) => {
    update({ doubleClickDelay: maxDelay });
  });

  useEffect(() => {
    const max = maxDoubleClickDelayMs(
      settings.clickSpeed,
      settings.clickInterval,
    );
    if (settings.doubleClickDelay > max) {
      clampDoubleClickDelay(max);
    }
  }, [
    settings.clickInterval,
    settings.clickSpeed,
    settings.doubleClickDelay,
  ]);

  const showDesc = (text: string) =>
    showExplanations ? <p className="adv-desc">{text}</p> : null;

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
              <div className="adv-row">
                <div className="adv-numbox-sm">
                  <NumInput
                    value={settings.clickSpeed}
                    onChange={(v) => update({ clickSpeed: v })}
                    min={1}
                    max={500}
                  />
                </div>
                <span className="adv-label">Clicks Per</span>
                <div className="simple-seg-group">
                  {(["s", "m", "h", "d"] as const).map((u) => (
                    <button
                      key={u}
                      className={`simple-seg-btn ${settings.clickInterval === u ? "active" : ""}`}
                      onClick={() => update({ clickInterval: u })}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <div className="adv-row" style={{ marginTop: rowSpacing }}>
                <span className="adv-label">Hotkey</span>
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
                  {(["Toggle", "Hold"] as const).map((m) => (
                    <button
                      key={m}
                      className={`simple-seg-btn ${settings.mode === m ? "active" : ""}`}
                      onClick={() => update({ mode: m })}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="adv-row" style={{ marginTop: rowSpacing }}>
                <span className="adv-label">Mouse Button</span>
                <div className="simple-seg-group">
                  {(["Left", "Middle", "Right"] as const).map((b) => (
                    <button
                      key={b}
                      className={`simple-seg-btn ${settings.mouseButton === b ? "active" : ""}`}
                      onClick={() => update({ mouseButton: b })}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="sectioncontainer">
              <div className="adv-card-header">
                <span className="adv-card-title">Duty Cycle</span>
                <div className="adv-row" style={{ gap: 6 }}>
                  <div className="adv-minmax">
                    <div className="adv-numbox-sm">
                      <NumInput
                        value={settings.dutyCycle}
                        onChange={(v) => update({ dutyCycle: v })}
                        min={0}
                        max={100}
                      />
                      <span className="adv-unit">%</span>
                    </div>
                  </div>
                </div>
              </div>
              <CardDivider />
              {showDesc(
                "Randomizes how long the mouse button stays held between the min and max percentages of each click interval.",
              )}
            </div>

            <div className="sectioncontainer">
              <div className="adv-card-header">
                <span className="adv-card-title">Speed Variation</span>
                <div className="adv-row" style={{ gap: 8 }}>
                  <Disableable enabled={settings.speedVariationEnabled}>
                    <div className="adv-numbox-sm">
                      <NumInput
                        value={settings.speedVariation}
                        onChange={(v) => update({ speedVariation: v })}
                        min={0}
                        max={200}
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
              <Disableable enabled={settings.speedVariationEnabled}>
                <CardDivider />

                {showDesc(
                  "Randomizes click timing around your configured speed by up to this percentage.",
                )}
              </Disableable>
            </div>

            <div className="sectioncontainer">
              <div className="adv-card-header">
                <span className="adv-card-title">Double Click</span>
                <ToggleBtn
                  value={settings.doubleClickEnabled}
                  onChange={(v) => update({ doubleClickEnabled: v })}
                  disabled={
                    settings.clickInterval === "s"
                      ? settings.clickSpeed > 49
                      : settings.clickInterval === "m"
                        ? settings.clickSpeed / 60 > 49
                        : settings.clickInterval === "h"
                          ? settings.clickSpeed / 3600 > 49
                          : settings.clickInterval === "d"
                            ? settings.clickSpeed / 86400 > 49
                            : settings.clickSpeed > 49
                  }
                />
              </div>
              <CardDivider />
              <Disableable enabled={settings.doubleClickEnabled}>
                <div className="adv-row" style={{ gap: 8 }}>
                  {showExplanations && (
                    <p className="adv-desc" style={{ flex: 1 }}>
                      Fires the button twice per interval with a configurable
                      delay between the clicks.
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
                    <div className="adv-numbox-sm">
                      <NumInput
                        value={settings.doubleClickDelay}
                        onChange={(v) => update({ doubleClickDelay: v })}
                        min={20}
                        max={maxDoubleClickDelayMs(
                          settings.clickSpeed,
                          settings.clickInterval,
                        )}
                      />
                      <span className="adv-unit">ms</span>
                    </div>
                    <span className="adv-label-sm">delay</span>
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
                <span className="adv-card-title">Click Limit</span>
                <div className="adv-row" style={{ gap: 6 }}>
                  <Disableable enabled={settings.clickLimitEnabled}>
                    <div className="adv-numbox-sm">
                      <NumInput
                        value={settings.clickLimit}
                        onChange={(v) => update({ clickLimit: v })}
                        min={1}
                        style={{ width: "89px", textAlign: "right" }}
                      />
                      <span className="adv-unit">clicks</span>
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
                <span className="adv-card-title">Time Limit</span>
                <div className="adv-row" style={{ gap: 6 }}>
                  <Disableable enabled={settings.timeLimitEnabled}>
                    <div className="adv-row" style={{ gap: 6 }}>
                      <div className="adv-numbox-sm">
                        <NumInput
                          value={settings.timeLimit}
                          onChange={(v) => update({ timeLimit: v })}
                          min={1}
                          style={{ width: "38px", textAlign: "right" }}
                        />
                      </div>
                      <div className="simple-seg-group">
                        {(["s", "m", "h"] as const).map((u) => (
                          <button
                            key={u}
                            className={`simple-seg-btn ${settings.timeLimitUnit === u ? "active" : ""}`}
                            onClick={() => update({ timeLimitUnit: u })}
                          >
                            {u}
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
                <span className="adv-card-title">Corner Stop</span>
                <ToggleBtn
                  value={settings.cornerStopEnabled}
                  onChange={(v) => {
                    update({ cornerStopEnabled: v });
                  }}
                />
              </div>
              <CardDivider />
              <Disableable enabled={settings.cornerStopEnabled}>
                <div className="adv-row" style={{ gap: 8 }}>
                  {showExplanations && (
                    <p className="adv-desc" style={{ flex: 1 }}>
                      Stops the clicker when the cursor enters a screen corner.
                      Keep it as a failsafe.
                    </p>
                  )}
                  <div className="adv-corner-grid">
                    {(["tl", "tr", "bl", "br"] as const).map((c) => (
                      <div key={c} className="adv-corner-box">
                        <div className={`adv-arc adv-arc-${c}`} />
                        <NumInput
                          value={settings[CORNER_KEYS[c]]}
                          onChange={(v) => {
                            update({ [CORNER_KEYS[c]]: v });
                          }}
                          min={0}
                          max={999}
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
                <span className="adv-card-title">Edge Stop</span>
                <ToggleBtn
                  value={settings.edgeStopEnabled}
                  onChange={(v) => {
                    update({ edgeStopEnabled: v });
                  }}
                />
              </div>
              <CardDivider />
              <Disableable enabled={settings.edgeStopEnabled}>
                <div className="adv-row" style={{ gap: 8 }}>
                  {showExplanations && (
                    <p className="adv-desc" style={{ flex: 1 }}>
                      Stops the clicker when the cursor reaches a screen edge.
                      Keep it as a failsafe.
                    </p>
                  )}
                  <div className="adv-corner-grid">
                    {(["top", "right", "left", "bottom"] as const).map((e) => (
                      <div key={e} className="adv-corner-box">
                        <div className={`adv-edge-bar adv-edge-bar-${e}`} />
                        <NumInput
                          value={settings[EDGE_KEYS[e]]}
                          onChange={(v) => {
                            update({ [EDGE_KEYS[e]]: v });
                          }}
                          min={0}
                          max={999}
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
                <span className="adv-card-title">Position</span>
                <ToggleBtn
                  value={settings.positionEnabled}
                  onChange={(v) => update({ positionEnabled: v })}
                />
              </div>
              <CardDivider />
              <Disableable enabled={settings.positionEnabled}>
                <div className="adv-row" style={{ marginTop: 8, gap: 6 }}>
                  {showExplanations && (
                    <p className="adv-desc" style={{ flex: 1 }}>
                      Moves the cursor to the saved point before each click
                      while enabled.
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
                          min={0}
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
                          min={0}
                          style={{ width: "37px" }}
                        />
                      </div>
                    </div>
                    <button
                      className="adv-pick-btn"
                      onClick={handlePickPosition}
                      disabled={pickingPosition}
                    >
                      {pickCountdown
                        ? `Picking in ${pickCountdown}`
                        : pickingPosition
                          ? "Picking..."
                          : "Pick"}
                    </button>
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
            <div className="adv-row">
              <div className="adv-numbox-sm">
                <NumInput
                  value={settings.clickSpeed}
                  onChange={(v) => update({ clickSpeed: v })}
                  min={1}
                  max={500}
                />
              </div>
              <span className="adv-label">Clicks Per</span>
              <div className="simple-seg-group">
                {(["s", "m", "h", "d"] as const).map((u) => (
                  <button
                    key={u}
                    className={`simple-seg-btn ${settings.clickInterval === u ? "active" : ""}`}
                    onClick={() => update({ clickInterval: u })}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <div className="adv-row" style={{ marginTop: rowSpacing }}>
              <span className="adv-label">Hotkey</span>
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
                {(["Toggle", "Hold"] as const).map((m) => (
                  <button
                    key={m}
                    className={`simple-seg-btn ${settings.mode === m ? "active" : ""}`}
                    onClick={() => update({ mode: m })}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="adv-row" style={{ marginTop: rowSpacing }}>
              <span className="adv-label">Mouse Button</span>
              <div className="simple-seg-group">
                {(["Left", "Middle", "Right"] as const).map((b) => (
                  <button
                    key={b}
                    className={`simple-seg-btn ${settings.mouseButton === b ? "active" : ""}`}
                    onClick={() => update({ mouseButton: b })}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="sectioncontainer adv-compact-card">
            <div className="adv-card-title">Double Click</div>
            <CardDivider />
            <div className="adv-limit-block">
              <div className="adv-card-header">
                <span className="adv-label">Enabled</span>
                <ToggleBtn
                  value={settings.doubleClickEnabled}
                  onChange={(v) => update({ doubleClickEnabled: v })}
                  disabled={
                    settings.clickInterval === "s"
                      ? settings.clickSpeed > 49
                      : settings.clickInterval === "m"
                        ? settings.clickSpeed / 60 > 49
                        : settings.clickInterval === "h"
                          ? settings.clickSpeed / 3600 > 49
                          : settings.clickInterval === "d"
                            ? settings.clickSpeed / 86400 > 49
                            : settings.clickSpeed > 49
                  }
                />
              </div>
              <Disableable enabled={settings.doubleClickEnabled}>
                <div className={cardBodyClass}>
                  <div className="adv-inline-controls adv-inline-controls-start">
                    <div className="adv-numbox-sm">
                      <NumInput
                        value={settings.doubleClickDelay}
                        onChange={(v) => update({ doubleClickDelay: v })}
                        min={20}
                        max={maxDoubleClickDelayMs(
                          settings.clickSpeed,
                          settings.clickInterval,
                        )}
                      />
                      <span className="adv-unit">ms</span>
                    </div>
                    <span className="adv-label-sm">delay</span>
                  </div>
                </div>
              </Disableable>
            </div>
          </div>
        </div>

        <div className="adv-compact-grid">
          <div className="sectioncontainer adv-compact-card adv-compact-card-wide">
            <div className="adv-card-header">
              <span className="adv-card-title">Position</span>
              <ToggleBtn
                value={settings.positionEnabled}
                onChange={(v) => update({ positionEnabled: v })}
              />
            </div>
            <CardDivider />
            <Disableable enabled={settings.positionEnabled}>
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
                      min={0}
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
                      min={0}
                      style={{ width: "32px" }}
                    />
                  </div>
                  <button
                    className="adv-pick-btn adv-pick-btn-inline"
                    onClick={handlePickPosition}
                    disabled={pickingPosition}
                  >
                    {pickCountdown
                      ? `Picking in ${pickCountdown}`
                      : pickingPosition
                        ? "Picking..."
                        : "Pick"}
                  </button>
                </div>
              </div>
            </Disableable>
          </div>

          <div className="adv-compact-three-grid">
            <div className="sectioncontainer adv-compact-card">
              <div className="adv-card-header">
                <span className="adv-card-title">Click Limit</span>
                <ToggleBtn
                  value={settings.clickLimitEnabled}
                  onChange={(v) => update({ clickLimitEnabled: v })}
                />
              </div>
              <CardDivider />
              <Disableable enabled={settings.clickLimitEnabled}>
                <div className={cardBodyClass}>
                  <div className="adv-inline-controls adv-inline-controls-start adv-limit-inputs">
                    <div className="adv-numbox-sm">
                      <NumInput
                        value={settings.clickLimit}
                        onChange={(v) => update({ clickLimit: v })}
                        min={1}
                        max={10000000}
                        style={{ width: "72px", textAlign: "right" }}
                      />
                      <span className="adv-unit">clicks</span>
                    </div>
                  </div>
                </div>
              </Disableable>
            </div>

            <div className="sectioncontainer adv-compact-card">
              <div className="adv-card-header">
                <span className="adv-card-title">Time Limit</span>
                <ToggleBtn
                  value={settings.timeLimitEnabled}
                  onChange={(v) => update({ timeLimitEnabled: v })}
                />
              </div>
              <CardDivider />
              <Disableable enabled={settings.timeLimitEnabled}>
                <div className={cardBodyClass}>
                  <div className="adv-inline-controls adv-inline-controls-start adv-limit-inputs">
                    <div className="adv-numbox-sm">
                      <NumInput
                        value={settings.timeLimit}
                        onChange={(v) => update({ timeLimit: v })}
                        min={1}
                        style={{ width: "32px", textAlign: "right" }}
                      />
                    </div>
                    <div className="simple-seg-group">
                      {(["s", "m", "h"] as const).map((u) => (
                        <button
                          key={u}
                          className={`simple-seg-btn ${settings.timeLimitUnit === u ? "active" : ""}`}
                          onClick={() => update({ timeLimitUnit: u })}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Disableable>
            </div>

            <div className="sectioncontainer adv-compact-card">
              <div className="adv-card-header">
                <span className="adv-card-title">Duty Cycle</span>
                <ToggleBtn
                  value={settings.dutyCycleEnabled}
                  onChange={(v) => update({ dutyCycleEnabled: v })}
                />
              </div>
              <CardDivider />
              <Disableable enabled={settings.dutyCycleEnabled}>
                <div className={cardBodyClass}>
                  <div className="adv-inline-controls adv-inline-controls-start">
                    <div className="adv-minmax">
                      <div className="adv-numbox-sm">
                        <NumInput
                          value={settings.dutyCycle}
                          onChange={(v) => update({ dutyCycle: v })}
                          min={0}
                          max={200}
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
                <span className="adv-card-title">Speed Variation</span>
                <ToggleBtn
                  value={settings.speedVariationEnabled}
                  onChange={(v) => update({ speedVariationEnabled: v })}
                />
              </div>
              <CardDivider />
              <Disableable enabled={settings.speedVariationEnabled}>
                <div className={cardBodyClass}>
                  <div className="adv-inline-controls adv-inline-controls-start">
                    <div className="adv-numbox-sm">
                      <NumInput
                        value={settings.speedVariation}
                        onChange={(v) => update({ speedVariation: v })}
                        min={0}
                        max={200}
                      />
                      <span className="adv-unit">%</span>
                    </div>
                  </div>
                </div>
              </Disableable>
            </div>

            <div className="sectioncontainer adv-compact-card">
              <div className="adv-card-header">
                <span className="adv-card-title">Corner Stop</span>
                <ToggleBtn
                  value={settings.cornerStopEnabled}
                  onChange={(v) => {
                    update({ cornerStopEnabled: v });
                  }}
                />
              </div>
              <CardDivider />
              <Disableable enabled={settings.cornerStopEnabled}>
                <div className={featureBodyClass}>
                  <div className="adv-corner-grid">
                    {(["tl", "tr", "bl", "br"] as const).map((c) => (
                      <div key={c} className="adv-corner-box">
                        <div className={`adv-arc adv-arc-${c}`} />
                        <NumInput
                          value={settings[CORNER_KEYS[c]]}
                          onChange={(v) => {
                            update({ [CORNER_KEYS[c]]: v });
                          }}
                          min={0}
                          max={999}
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
                <span className="adv-card-title">Edge Stop</span>
                <ToggleBtn
                  value={settings.edgeStopEnabled}
                  onChange={(v) => {
                    update({ edgeStopEnabled: v });
                  }}
                />
              </div>
              <CardDivider />
              <Disableable enabled={settings.edgeStopEnabled}>
                <div className={featureBodyClass}>
                  <div className="adv-corner-grid">
                    {(["top", "right", "left", "bottom"] as const).map((e) => (
                      <div key={e} className="adv-corner-box">
                        <div className={`adv-edge-bar adv-edge-bar-${e}`} />
                        <NumInput
                          value={settings[EDGE_KEYS[e]]}
                          onChange={(v) => {
                            update({ [EDGE_KEYS[e]]: v });
                          }}
                          min={0}
                          max={999}
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
