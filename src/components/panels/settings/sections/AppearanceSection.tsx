import { memo, useCallback, useMemo, type CSSProperties } from "react";
import { error } from "@tauri-apps/plugin-log";
import { open } from "@tauri-apps/plugin-dialog";
import {
  getExtension,
  IMAGE_EXTENSIONS,
  isLegacyVideoExtension,
  PLAYABLE_VIDEO_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from "../../../../backgroundMedia";
import { DEFAULT_ACCENT_COLOR } from "../../../../settingsSchema";
import type { IconColor, IconTheme } from "../../../../settingsSchema";
import type { Settings } from "../../../../store";
import { SettingsCard } from "./shared";

const MEDIA_FILTERS = [
  {
    name: "All Media",
    extensions: [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS] as string[],
  },
  {
    name: "Images",
    extensions: [...IMAGE_EXTENSIONS] as string[],
  },
  {
    name: "Videos (reliable)",
    extensions: [...PLAYABLE_VIDEO_EXTENSIONS] as string[],
  },
];

const PAGES = [
  { suffix: "Simple", label: "Simple Page" },
  { suffix: "Advanced", label: "Advanced Page" },
  { suffix: "Zones", label: "Zones Page" },
  { suffix: "ClickPoints", label: "Click Points Page" },
  { suffix: "Settings", label: "Settings Page" },
] as const;

const THEME_SEG_OPTIONS = ["dark", "light"] as const;
const ICON_THEME_SEG_OPTIONS: IconTheme[] = ["auto", "dark", "light"];
const ICON_COLOR_SEG_OPTIONS: IconColor[] = ["theme", "default"];

const LEGACY_WARNING_ROW_STYLE: CSSProperties = { marginTop: "-0.5rem" };
const LEGACY_WARNING_TEXT_STYLE: CSSProperties = {
  color: "var(--accent-yellow)",
};

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const PageAppearanceControls = memo(function PageAppearanceControls({
  settings,
  update,
  suffix,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  suffix: string;
}) {
  const bgImageKey = `backgroundImage${suffix}` as keyof Settings;
  const bgOpacityKey = `backgroundOpacity${suffix}` as keyof Settings;
  const winOpacityKey = `windowOpacity${suffix}` as keyof Settings;
  const panelOpacityKey = `panelOpacity${suffix}` as keyof Settings;
  const panelBlurKey = `panelBlur${suffix}` as keyof Settings;
  const bgBlurKey = `backgroundBlur${suffix}` as keyof Settings;

  const bgImage = settings[bgImageKey] as string;
  const bgOpacity = settings[bgOpacityKey] as number;
  const winOpacity = settings[winOpacityKey] as number;
  const panelOpacity = settings[panelOpacityKey] as number;
  const panelBlur = settings[panelBlurKey] as number;
  const bgBlur = settings[bgBlurKey] as number;

  const handleBrowse = useCallback(async () => {
    try {
      const selected = await open({ multiple: false, filters: MEDIA_FILTERS });
      if (selected) {
        update({ [bgImageKey]: selected as string });
      }
    } catch (err) {
      error(
        JSON.stringify({
          source: "SettingsPanel.pickImage",
          error: String(err),
        }),
      );
    }
  }, [bgImageKey, update]);

  const handleBgImageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      update({ [bgImageKey]: e.target.value }),
    [bgImageKey, update],
  );

  const handleRemoveBgImage = useCallback(
    () => update({ [bgImageKey]: "" }),
    [bgImageKey, update],
  );

  const handleWinOpacityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      update({ [winOpacityKey]: Number(e.target.value) }),
    [winOpacityKey, update],
  );

  const handleBgOpacityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      update({ [bgOpacityKey]: Number(e.target.value) }),
    [bgOpacityKey, update],
  );

  const handlePanelOpacityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      update({ [panelOpacityKey]: Number(e.target.value) }),
    [panelOpacityKey, update],
  );

  const handleBgBlurChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      update({ [bgBlurKey]: Number(e.target.value) }),
    [bgBlurKey, update],
  );

  const handlePanelBlurChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      update({ [panelBlurKey]: Number(e.target.value) }),
    [panelBlurKey, update],
  );

  const legacyVideoWarning = useMemo(() => {
    const ext = getExtension(bgImage);
    if (!isLegacyVideoExtension(ext)) return null;
    return (
      <div className="settings-row" style={LEGACY_WARNING_ROW_STYLE}>
        <span className="settings-sublabel" style={LEGACY_WARNING_TEXT_STYLE}>
          MOV/M4V/AVI/MKV often fail. If video stays black, convert it to mp4.
        </span>
      </div>
    );
  }, [bgImage]);

  return (
    <>
      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Background Media</span>
          <span className="settings-sublabel">
            Path or URL to an image or video. Images support transparency.
            Videos auto-loop muted.
          </span>
        </div>
        <div className="settings-bg-image-row">
          <input
            className="settings-bg-input"
            type="text"
            value={bgImage}
            onChange={handleBgImageChange}
            placeholder="https://example.com/image.png or C:\Videos\loop.mp4"
          />
          <div className="settings-bg-buttons">
            <button className="settings-btn-secondary" onClick={handleBrowse}>
              Browse
            </button>
            <button
              className="settings-btn-danger settings-btn-danger--compact"
              onClick={handleRemoveBgImage}
              disabled={!bgImage}
            >
              Remove
            </button>
          </div>
        </div>
        {legacyVideoWarning}
      </div>

      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Background Opacity</span>
          <span className="settings-sublabel">
            Transparency of the app window background.
          </span>
        </div>
        <div className="settings-opacity-controls">
          <input
            type="range"
            className="settings-opacity-slider"
            min="0"
            max="100"
            value={winOpacity}
            onChange={handleWinOpacityChange}
          />
          <span className="settings-slider-value">{winOpacity}%</span>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Background Media Opacity</span>
          <span className="settings-sublabel">
            Transparency of the background image or video.
          </span>
        </div>
        <div className="settings-opacity-controls">
          <input
            type="range"
            className="settings-opacity-slider"
            min="0"
            max="100"
            value={bgOpacity}
            disabled={!bgImage}
            onChange={handleBgOpacityChange}
          />
          <span className="settings-slider-value">{bgOpacity}%</span>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Panel Opacity</span>
          <span className="settings-sublabel">Transparency of the panel.</span>
        </div>
        <div className="settings-opacity-controls">
          <input
            type="range"
            className="settings-opacity-slider"
            min="0"
            max="100"
            value={panelOpacity}
            onChange={handlePanelOpacityChange}
          />
          <span className="settings-slider-value">{panelOpacity}%</span>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Background Blur</span>
          <span className="settings-sublabel">
            Blur the background media itself, across the whole UI.
          </span>
        </div>
        <div className="settings-opacity-controls">
          <input
            type="range"
            className="settings-opacity-slider"
            min="0"
            max="20"
            value={bgBlur}
            disabled={!bgImage}
            onChange={handleBgBlurChange}
          />
          <span className="settings-slider-value">{bgBlur}px</span>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Panel Blur</span>
          <span className="settings-sublabel">
            Blur effect behind the panel.
          </span>
        </div>
        <div className="settings-opacity-controls">
          <input
            type="range"
            className="settings-opacity-slider"
            min="0"
            max="20"
            value={panelBlur}
            onChange={handlePanelBlurChange}
          />
          <span className="settings-slider-value">{panelBlur}px</span>
        </div>
      </div>
    </>
  );
});

const ThemeAccentCard = memo(function ThemeAccentCard({
  theme,
  accentColor,
  update,
}: {
  theme: Settings["theme"];
  accentColor: string;
  update: (patch: Partial<Settings>) => void;
}) {
  const handleThemeSelect = useCallback(
    (next: Settings["theme"]) => update({ theme: next }),
    [update],
  );
  const handleAccentChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      update({ accentColor: event.target.value }),
    [update],
  );
  const handleAccentReset = useCallback(
    () => update({ accentColor: DEFAULT_ACCENT_COLOR }),
    [update],
  );
  return (
    <SettingsCard title="Theme & Accent" description="Applied to all pages.">
      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Theme</span>
          <span className="settings-sublabel">
            Choose between dark and light mode.
          </span>
        </div>
        <div className="settings-seg-group">
          {THEME_SEG_OPTIONS.map((option) => (
            <button
              key={option}
              className={`settings-seg-btn ${theme === option ? "active" : ""}`}
              onClick={() => handleThemeSelect(option)}
            >
              {option === "dark" ? "Dark" : "Light"}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Accent Color</span>
          <span className="settings-sublabel">The primary accent color.</span>
        </div>
        <div className="settings-color-controls">
          <label className="settings-color-picker">
            <input
              type="color"
              value={accentColor}
              onChange={handleAccentChange}
            />
          </label>
          <span className="settings-value settings-value--mono">
            {accentColor.toUpperCase()}
          </span>
          <button
            className="settings-btn-secondary"
            onClick={handleAccentReset}
            disabled={accentColor === DEFAULT_ACCENT_COLOR}
          >
            Reset
          </button>
        </div>
      </div>
    </SettingsCard>
  );
});

export default function AppearanceSection({ settings, update }: Props) {
  const isPerPage = settings.perPageAppearance;

  const handleModeChange = useCallback(
    (individual: boolean) => update({ perPageAppearance: individual }),
    [update],
  );

  const handleTaskbarIconToggle = useCallback(
    () => update({ taskbarIconEnabled: !settings.taskbarIconEnabled }),
    [update, settings.taskbarIconEnabled],
  );

  const handleIconThemeSelect = useCallback(
    (opt: IconTheme) => update({ taskbarIconTheme: opt }),
    [update],
  );

  const handleIconColorSelect = useCallback(
    (opt: IconColor) => {
      if (settings.taskbarIconEnabled) update({ taskbarIconColor: opt });
    },
    [update, settings.taskbarIconEnabled],
  );

  const handleStatusBarToggle = useCallback(
    () => update({ statusBarEnabled: !settings.statusBarEnabled }),
    [update, settings.statusBarEnabled],
  );

  return (
    <>
      <ThemeAccentCard
        theme={settings.theme}
        accentColor={settings.accentColor}
        update={update}
      />

      <SettingsCard
        title="Appearance Mode"
        description="Use one style for all pages, or customize each page individually."
      >
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Mode</span>
          </div>
          <div className="settings-seg-group">
            <button
              className={`settings-seg-btn ${!isPerPage ? "active" : ""}`}
              onClick={() => handleModeChange(false)}
            >
              Global
            </button>
            <button
              className={`settings-seg-btn ${isPerPage ? "active" : ""}`}
              onClick={() => handleModeChange(true)}
            >
              Individual
            </button>
          </div>
        </div>
      </SettingsCard>

      {!isPerPage ? (
        <SettingsCard title="Page Style">
          <PageAppearanceControls
            settings={settings}
            update={update}
            suffix=""
          />
        </SettingsCard>
      ) : (
        PAGES.map((page) => (
          <section className="settings-card" key={page.suffix}>
            <span className="settings-page-header">{page.label}</span>
            <div className="settings-card-content">
              <PageAppearanceControls
                settings={settings}
                update={update}
                suffix={page.suffix}
              />
            </div>
          </section>
        ))
      )}

      <SettingsCard
        title="Taskbar Icon"
        description="Control how the taskbar and tray icon looks."
      >
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Active Icon</span>
            <span className="settings-sublabel">
              Show different icon when clicker is active.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.taskbarIconEnabled ? "on" : "off"}`}
              onClick={handleTaskbarIconToggle}
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Icon Theme</span>
            <span className="settings-sublabel">
              Which themed icons to use. Auto follows app theme.
            </span>
          </div>
          <div className="settings-seg-group">
            {ICON_THEME_SEG_OPTIONS.map((opt) => (
              <button
                key={opt}
                className={`settings-seg-btn ${settings.taskbarIconTheme === opt ? "active" : ""}`}
                onClick={() => handleIconThemeSelect(opt)}
              >
                {opt === "auto" ? "Auto" : opt === "dark" ? "Dark" : "Light"}
              </button>
            ))}
          </div>
        </div>

        <div
          className={`settings-row ${!settings.taskbarIconEnabled ? "settings-row--disabled" : ""}`}
        >
          <div className="settings-label-group">
            <span className="settings-label">Icon Color</span>
            <span className="settings-sublabel">
              Use accent color or default icon colors.
            </span>
          </div>
          <div className="settings-seg-group">
            {ICON_COLOR_SEG_OPTIONS.map((opt) => (
              <button
                key={opt}
                className={`settings-seg-btn ${settings.taskbarIconColor === opt ? "active" : ""}`}
                onClick={() => handleIconColorSelect(opt)}
              >
                {opt === "theme" ? "Theme" : "Default"}
              </button>
            ))}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Status Bar"
        description="Show the status bar at the bottom of the window."
      >
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Footer</span>
            <span className="settings-sublabel">
              Shows active preset, version, and stop reasons.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.statusBarEnabled ? "on" : "off"}`}
              onClick={handleStatusBarToggle}
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>
      </SettingsCard>
    </>
  );
}
