import { memo, useCallback, type CSSProperties } from "react";
import {
  INDICATOR_BACKGROUND_MODE_OPTIONS,
  INDICATOR_COLOR_MODE_OPTIONS,
  INDICATOR_COUNTDOWN_MODE_OPTIONS,
  INDICATOR_CORNER_OPTIONS,
} from "../../../../settingsSchema";
import type {
  IndicatorBackgroundMode,
  IndicatorColorMode,
  IndicatorCorner,
  IndicatorCountdownMode,
} from "../../../../settingsSchema";
import type { Settings } from "../../../../store";
import { AdvDropdown, NumInput } from "../../advanced/sections/shared";
import ColorPicker from "../../../ColorPicker";
import { SettingsCard } from "./shared";

const INDICATOR_CORNER_LABELS: Record<IndicatorCorner, string> = {
  "top-right": "Top Right",
  "top-left": "Top Left",
  "bottom-right": "Bottom Right",
  "bottom-left": "Bottom Left",
};

const INDICATOR_COLOR_MODE_LABELS: Record<IndicatorColorMode, string> = {
  theme: "Theme",
  black: "Black",
  white: "White",
  custom: "Custom",
};

const INDICATOR_COUNTDOWN_LABELS: Record<IndicatorCountdownMode, string> = {
  plain: "None",
  short: "H/W",
  words: "Hold/Wait",
};

const INDICATOR_BACKGROUND_LABELS: Record<IndicatorBackgroundMode, string> = {
  off: "None",
  card: "Card",
  shadow: "Shadow",
};

const INDICATOR_CORNER_DROPDOWN_OPTIONS = INDICATOR_CORNER_OPTIONS.map(
  (value) => ({ value, label: INDICATOR_CORNER_LABELS[value] }),
);

const INDICATOR_UNIT_ROW_STYLE: CSSProperties = { gap: "0.25rem" };
const INDICATOR_UNIT_STYLE: CSSProperties = {
  minWidth: "0.5rem",
  textAlign: "left",
};
const INDICATOR_INPUT_STYLE: CSSProperties = {
  width: "6ch",
  textAlign: "right",
};
const INDICATOR_DIM_INPUT_STYLE: CSSProperties = {
  width: "4ch",
  textAlign: "right",
};

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export default memo(function OverlaySection({ settings, update }: Props) {
  const indicatorEnabled = settings.indicatorEnabled;
  const indicatorRowClass = indicatorEnabled
    ? "settings-row"
    : "settings-row settings-row--disabled";

  const patchIndicator = useCallback(
    (patch: Partial<Settings>) => update(patch),
    [update],
  );

  const handleIndicatorToggle = useCallback(
    () => patchIndicator({ indicatorEnabled: !indicatorEnabled }),
    [patchIndicator, indicatorEnabled],
  );

  const handleIndicatorCornerChange = useCallback(
    (value: string) => {
      if (!indicatorEnabled) return;
      patchIndicator({ indicatorCorner: value as IndicatorCorner });
    },
    [patchIndicator, indicatorEnabled],
  );

  const handleIndicatorColorModeChange = useCallback(
    (mode: IndicatorColorMode) => {
      if (!indicatorEnabled) return;
      patchIndicator({ indicatorColorMode: mode });
    },
    [patchIndicator, indicatorEnabled],
  );

  const handleIndicatorCustomColorChange = useCallback(
    (nextColor: string) => {
      if (!indicatorEnabled) return;
      patchIndicator({ indicatorCustomColor: nextColor });
    },
    [patchIndicator, indicatorEnabled],
  );

  const handleIndicatorSizeChange = useCallback(
    (value: number) => {
      if (!indicatorEnabled) return;
      patchIndicator({ indicatorSize: value });
    },
    [patchIndicator, indicatorEnabled],
  );

  const handleIndicatorOffsetXChange = useCallback(
    (value: number) => {
      if (!indicatorEnabled) return;
      patchIndicator({ indicatorOffsetX: value });
    },
    [patchIndicator, indicatorEnabled],
  );

  const handleIndicatorOffsetYChange = useCallback(
    (value: number) => {
      if (!indicatorEnabled) return;
      patchIndicator({ indicatorOffsetY: value });
    },
    [patchIndicator, indicatorEnabled],
  );

  const handleIndicatorFlashToggle = useCallback(() => {
    if (!indicatorEnabled) return;
    patchIndicator({ indicatorFlashEnabled: !settings.indicatorFlashEnabled });
  }, [patchIndicator, indicatorEnabled, settings.indicatorFlashEnabled]);

  const handleIndicatorFlashDimChange = useCallback(
    (value: number) => {
      if (!indicatorEnabled) return;
      patchIndicator({ indicatorFlashDim: value });
    },
    [patchIndicator, indicatorEnabled],
  );

  const handleIndicatorCountdownToggle = useCallback(() => {
    if (!indicatorEnabled) return;
    patchIndicator({
      indicatorCountdownEnabled: !settings.indicatorCountdownEnabled,
    });
  }, [patchIndicator, indicatorEnabled, settings.indicatorCountdownEnabled]);

  const handleIndicatorCountdownMode = useCallback(
    (mode: IndicatorCountdownMode) => {
      if (!indicatorEnabled) return;
      patchIndicator({ indicatorCountdownMode: mode });
    },
    [patchIndicator, indicatorEnabled],
  );

  const handleIndicatorBackgroundMode = useCallback(
    (mode: IndicatorBackgroundMode) => {
      if (!indicatorEnabled) return;
      patchIndicator({ indicatorBackgroundMode: mode });
    },
    [patchIndicator, indicatorEnabled],
  );

  const handleIndicatorBackgroundStrength = useCallback(
    (value: number) => {
      if (!indicatorEnabled) return;
      patchIndicator({ indicatorBackgroundStrength: value });
    },
    [patchIndicator, indicatorEnabled],
  );

  return (
    <SettingsCard
      title="Click Indicator"
      description="Show a symbol in the corner of the screen while the clicker is running."
    >
      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Show While Clicking</span>
          <span className="settings-sublabel">
            Only appears while the clicker is actively clicking.
          </span>
        </div>
        <div className="settings-toggle-wrapper">
          <button
            className={`settings-toggle ${indicatorEnabled ? "on" : "off"}`}
            onClick={handleIndicatorToggle}
          >
            <span className="settings-toggle-knob" />
          </button>
        </div>
      </div>

      <div className={indicatorRowClass}>
        <div className="settings-label-group">
          <span className="settings-label">Position</span>
          <span className="settings-sublabel">
            Corner of the monitor being clicked.
          </span>
        </div>
        <AdvDropdown
          value={settings.indicatorCorner}
          options={INDICATOR_CORNER_DROPDOWN_OPTIONS}
          onChange={handleIndicatorCornerChange}
          allowWindowOverflow
        />
      </div>

      <div className={indicatorRowClass}>
        <div className="settings-label-group">
          <span className="settings-label">Color</span>
          <span className="settings-sublabel">
            Theme follows your accent color.
          </span>
        </div>
        <div className="settings-seg-group">
          {INDICATOR_COLOR_MODE_OPTIONS.map((mode) => (
            <button
              key={mode}
              className={`settings-seg-btn ${settings.indicatorColorMode === mode ? "active" : ""}`}
              onClick={() => handleIndicatorColorModeChange(mode)}
            >
              {INDICATOR_COLOR_MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      {settings.indicatorColorMode === "custom" && (
        <div className={indicatorRowClass}>
          <div className="settings-label-group">
            <span className="settings-label">Custom Color</span>
            <span className="settings-sublabel">
              Used instead of the accent color.
            </span>
          </div>
          <div className="settings-color-controls">
            <ColorPicker
              value={settings.indicatorCustomColor}
              onChange={handleIndicatorCustomColorChange}
              label="Indicator custom color"
            />
            <span className="settings-value settings-value--mono">
              {settings.indicatorCustomColor.toUpperCase()}
            </span>
          </div>
        </div>
      )}

      <div className={indicatorRowClass}>
        <div className="settings-label-group">
          <span className="settings-label">Size</span>
          <span className="settings-sublabel">Symbol size in pixels.</span>
        </div>
        <div className="adv-numbox-sm" style={INDICATOR_UNIT_ROW_STYLE}>
          <span className="adv-unit" style={INDICATOR_UNIT_STYLE}>
            px
          </span>
          <NumInput
            hoverWheel={false}
            value={settings.indicatorSize}
            min={16}
            max={512}
            onChange={handleIndicatorSizeChange}
            style={INDICATOR_INPUT_STYLE}
          />
        </div>
      </div>

      <div className={indicatorRowClass}>
        <div className="settings-label-group">
          <span className="settings-label">Distance From Edge X</span>
          <span className="settings-sublabel">
            Horizontal distance from the nearest side.
          </span>
        </div>
        <div className="adv-numbox-sm" style={INDICATOR_UNIT_ROW_STYLE}>
          <span className="adv-unit" style={INDICATOR_UNIT_STYLE}>
            px
          </span>
          <NumInput
            hoverWheel={false}
            value={settings.indicatorOffsetX}
            min={0}
            max={4000}
            onChange={handleIndicatorOffsetXChange}
            style={INDICATOR_INPUT_STYLE}
          />
        </div>
      </div>

      <div className={indicatorRowClass}>
        <div className="settings-label-group">
          <span className="settings-label">Distance From Edge Y</span>
          <span className="settings-sublabel">
            Vertical distance from the nearest side.
          </span>
        </div>
        <div className="adv-numbox-sm" style={INDICATOR_UNIT_ROW_STYLE}>
          <span className="adv-unit" style={INDICATOR_UNIT_STYLE}>
            px
          </span>
          <NumInput
            hoverWheel={false}
            value={settings.indicatorOffsetY}
            min={0}
            max={4000}
            onChange={handleIndicatorOffsetYChange}
            style={INDICATOR_INPUT_STYLE}
          />
        </div>
      </div>

      <div className={indicatorRowClass}>
        <div className="settings-label-group">
          <span className="settings-label">Flash On Click</span>
          <span className="settings-sublabel">
            Brightens for the hold, then rests dimmer.
          </span>
        </div>
        <div className="settings-toggle-wrapper">
          <button
            className={`settings-toggle ${settings.indicatorFlashEnabled ? "on" : "off"}`}
            onClick={handleIndicatorFlashToggle}
          >
            <span className="settings-toggle-knob" />
          </button>
        </div>
      </div>

      {settings.indicatorFlashEnabled && (
        <div className={indicatorRowClass}>
          <div className="settings-label-group">
            <span className="settings-label">Flash Dim</span>
            <span className="settings-sublabel">
              How much dimmer it rests between clicks (%).
            </span>
          </div>
          <div className="adv-numbox-sm" style={INDICATOR_UNIT_ROW_STYLE}>
            <span className="adv-unit" style={INDICATOR_UNIT_STYLE}>
              %
            </span>
            <NumInput
              hoverWheel={false}
              value={settings.indicatorFlashDim}
              min={0}
              max={100}
              onChange={handleIndicatorFlashDimChange}
              style={INDICATOR_DIM_INPUT_STYLE}
            />
          </div>
        </div>
      )}

      <div className={indicatorRowClass}>
        <div className="settings-label-group">
          <span className="settings-label">Click Countdown</span>
          <span className="settings-sublabel">
            Shows the hold or wait time under the symbol.
          </span>
        </div>
        <div className="settings-toggle-wrapper">
          <button
            className={`settings-toggle ${settings.indicatorCountdownEnabled ? "on" : "off"}`}
            onClick={handleIndicatorCountdownToggle}
          >
            <span className="settings-toggle-knob" />
          </button>
        </div>
      </div>

      {settings.indicatorCountdownEnabled && (
        <div className={indicatorRowClass}>
          <div className="settings-label-group">
            <span className="settings-label">Countdown Text</span>
            <span className="settings-sublabel">
              Show the phase name, an abbreviation, or just the time.
            </span>
          </div>
          <div className="settings-seg-group">
            {INDICATOR_COUNTDOWN_MODE_OPTIONS.map((mode) => (
              <button
                key={mode}
                className={`settings-seg-btn ${settings.indicatorCountdownMode === mode ? "active" : ""}`}
                onClick={() => handleIndicatorCountdownMode(mode)}
              >
                {INDICATOR_COUNTDOWN_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={indicatorRowClass}>
        <div className="settings-label-group">
          <span className="settings-label">Background</span>
          <span className="settings-sublabel">
            Card behind the symbol, or a shadow around it.
          </span>
        </div>
        <div className="settings-seg-group">
          {INDICATOR_BACKGROUND_MODE_OPTIONS.map((mode) => (
            <button
              key={mode}
              className={`settings-seg-btn ${settings.indicatorBackgroundMode === mode ? "active" : ""}`}
              onClick={() => handleIndicatorBackgroundMode(mode)}
            >
              {INDICATOR_BACKGROUND_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      {settings.indicatorBackgroundMode !== "off" && (
        <div className={indicatorRowClass}>
          <div className="settings-label-group">
            <span className="settings-label">Background Strength</span>
            <span className="settings-sublabel">
              How strong the card or shadow is (%).
            </span>
          </div>
          <div className="adv-numbox-sm" style={INDICATOR_UNIT_ROW_STYLE}>
            <span className="adv-unit" style={INDICATOR_UNIT_STYLE}>
              %
            </span>
            <NumInput
              hoverWheel={false}
              value={settings.indicatorBackgroundStrength}
              min={0}
              max={100}
              onChange={handleIndicatorBackgroundStrength}
              style={INDICATOR_DIM_INPUT_STYLE}
            />
          </div>
        </div>
      )}
    </SettingsCard>
  );
});
