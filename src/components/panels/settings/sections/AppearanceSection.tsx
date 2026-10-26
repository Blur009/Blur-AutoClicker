import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { logDiagnostic } from "../../../../diagnostics";
import { open } from "@tauri-apps/plugin-dialog";
import { applyAccentTheme } from "../../../../accentTheme";
import { themeBaseOf } from "../../../../themeModel";
import {
  getExtension,
  IMAGE_EXTENSIONS,
  isLegacyVideoExtension,
  PLAYABLE_VIDEO_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from "../../../../backgroundMedia";
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_FONT_FAMILY,
  DEFAULT_TITLE_FONT,
} from "../../../../settingsSchema";
import type { IconColor, IconTheme } from "../../../../settingsSchema";
import type { Settings } from "../../../../store";
import ColorPicker from "../../../ColorPicker";
import { AdvDropdown } from "../../advanced/sections/shared";
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

const THEME_SEG_OPTIONS = ["dark", "light", "custom"] as const;
const ICON_THEME_SEG_OPTIONS: IconTheme[] = ["auto", "dark", "light"];
const ICON_COLOR_SEG_OPTIONS: IconColor[] = ["theme", "default"];

const LEGACY_WARNING_ROW_STYLE: CSSProperties = { marginTop: "-0.5rem" };
const LEGACY_WARNING_TEXT_STYLE: CSSProperties = {
  color: "var(--accent-yellow)",
};

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  onOpenCustomizer: () => void;
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
      logDiagnostic("SettingsPanel.pickImage", {
        error: String(err),
      });
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
            Path or URL to an image or video. Videos loop muted.
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
            How much of the desktop shows through the window.
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
            Fade the image or video behind the panels.
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
          <span className="settings-sublabel">
            Fade the panels, cards and inputs.
          </span>
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
            Blur the image or video itself.
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
            Blur what sits behind the panels.
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

let fontFamiliesPromise: Promise<string[] | null> | null = null;

function loadFontFamilies(): Promise<string[] | null> {
  if (!fontFamiliesPromise) {
    fontFamiliesPromise = invoke<string[]>("list_font_families").catch(
      (err) => {
        logDiagnostic("AppearanceSection.loadFontFamilies", {
          error: String(err),
        });
        fontFamiliesPromise = null;
        return null;
      },
    );
  }
  return fontFamiliesPromise;
}

const FontPicker = memo(function FontPicker({
  value,
  fallback,
  onChange,
}: {
  value: string;
  fallback: string;
  onChange: (next: string) => void;
}) {
  const [families, setFamilies] = useState<string[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadFontFamilies().then((list) => {
      if (alive) setFamilies(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  const options = useMemo(() => {
    const installed = families ?? [];
    const entries = [{ value: fallback, label: "Default" }];
    if (value !== fallback && !installed.includes(value)) {
      entries.push({
        value,
        label: `${value} (not installed)`,
      });
    }
    for (const family of installed) {
      if (family !== fallback) {
        entries.push({ value: family, label: family });
      }
    }
    return entries;
  }, [families, fallback, value]);

  return (
    <>
      <div className="font-dropdown">
        <AdvDropdown
          value={value}
          options={options}
          onChange={onChange}
          searchable
          hoverWheel={false}
        />
      </div>
      {value !== fallback && (
        <button
          type="button"
          className="settings-btn-secondary font-reset-btn"
          onClick={() => onChange(fallback)}
          aria-label="Reset font"
          title="Reset to default font"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-rotate-ccw"
          >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      )}
    </>
  );
});

const ThemeAccentCard = memo(function ThemeAccentCard({
  settings,
  update,
  onOpenCustomizer,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  onOpenCustomizer: () => void;
}) {
  const theme = settings.theme;
  const activeProfile = useMemo(
    () =>
      settings.themeProfiles.find(
        (profile) => profile.id === settings.activeThemeProfileId,
      ) ?? null,
    [settings.activeThemeProfileId, settings.themeProfiles],
  );
  const accentColor =
    theme === "custom" && activeProfile
      ? activeProfile.tokens.accent.hex
      : settings.accentColor;
  const accentDisabled = theme === "custom";

  const handleThemeSelect = useCallback(
    (next: Settings["theme"]) => {
      if (next !== "custom") {
        update({ theme: next });
        return;
      }

      const profiles = settings.themeProfiles;
      if (profiles.length === 0) {
        onOpenCustomizer();
        return;
      }

      const activeThemeProfileId = profiles.some(
        (profile) => profile.id === settings.activeThemeProfileId,
      )
        ? settings.activeThemeProfileId
        : profiles[0].id;
      update({ theme: "custom", activeThemeProfileId });
    },
    [
      onOpenCustomizer,
      settings.activeThemeProfileId,
      settings.themeProfiles,
      update,
    ],
  );

  const handleAccentChange = useCallback(
    (nextColor: string) => update({ accentColor: nextColor }),
    [update],
  );

  const handleAccentPreview = useCallback(
    (nextColor: string) => {
      const base = themeBaseOf(theme, activeProfile);
      applyAccentTheme(nextColor, base);
      const root = document.querySelector<HTMLElement>(".app-root");
      if (root) applyAccentTheme(nextColor, base, root);
    },
    [activeProfile, theme],
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
            Dark, light, or a theme of your own.
          </span>
        </div>
        <div className="settings-row-actions">
          <div className="settings-seg-group settings-seg-group--theme">
            {THEME_SEG_OPTIONS.map((option) => (
              <button
                key={option}
                className={`settings-seg-btn settings-seg-btn--${option} ${theme === option ? "active" : ""}`}
                onClick={() => handleThemeSelect(option)}
              >
                {option === "dark"
                  ? "Dark"
                  : option === "light"
                    ? "Light"
                    : "Custom"}
              </button>
            ))}
          </div>
          {theme === "custom" && settings.themeProfiles.length > 0 && (
            <button
              type="button"
              className="settings-btn-secondary settings-btn-icon"
              aria-label="Edit custom theme"
              title="Edit custom theme"
              onClick={onOpenCustomizer}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
                <path d="m15 5 4 4" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Accent Color</span>
          <span className="settings-sublabel">
            {accentDisabled
              ? "Part of the custom theme you are using."
              : "Color of toggles, sliders and active tabs."}
          </span>
        </div>
        <div
          className={`settings-color-controls${accentDisabled ? " settings-color-controls--disabled" : ""}`}
          aria-disabled={accentDisabled || undefined}
          inert={accentDisabled}
        >
          <ColorPicker
            value={accentColor}
            onChange={handleAccentChange}
            onPreview={handleAccentPreview}
            label="Accent color"
          />
          <span className="settings-value settings-value--mono">
            {accentColor.toUpperCase()}
          </span>
          <button
            className="settings-btn-secondary"
            onClick={handleAccentReset}
            disabled={accentDisabled || accentColor === DEFAULT_ACCENT_COLOR}
          >
            Reset
          </button>
        </div>
      </div>
      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">App Font</span>
          <span className="settings-sublabel">
            Any font on this PC, though some break the layout.
          </span>
        </div>
        <div className="settings-row-actions">
          <FontPicker
            value={settings.fontFamily}
            fallback={DEFAULT_FONT_FAMILY}
            onChange={(next) => update({ fontFamily: next })}
          />
        </div>
      </div>
    </SettingsCard>
  );
});

export default function AppearanceSection({
  settings,
  update,
  onOpenCustomizer,
}: Props) {
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

  const handleFancyTitleToggle = useCallback(
    () => update({ fancyTitle: !settings.fancyTitle }),
    [update, settings.fancyTitle],
  );

  const handleTitleFontChange = useCallback(
    (next: string) => update({ titleFont: next }),
    [update],
  );

  return (
    <>
      <ThemeAccentCard
        settings={settings}
        update={update}
        onOpenCustomizer={onOpenCustomizer}
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
        description="Change the icon in the taskbar and the tray."
      >
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Active Icon</span>
            <span className="settings-sublabel">
              Use a different icon while clicking.
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
              Auto follows the app theme.
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
              Tint the active icon with your accent color.
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
            <span className="settings-label">Enable</span>
            <span className="settings-sublabel">
              Shows active preset, version and stop reason.
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

      <SettingsCard title="Fun">
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Fancy Title</span>
            <span className="settings-sublabel">
              Give the window title a script font.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.fancyTitle ? "on" : "off"}`}
              onClick={handleFancyTitleToggle}
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>
        {settings.fancyTitle && (
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Title Font</span>
              <span className="settings-sublabel">
                Pristina by default, any installed font.
              </span>
            </div>
            <div className="settings-row-actions">
              <FontPicker
                value={settings.titleFont}
                fallback={DEFAULT_TITLE_FONT}
                onChange={handleTitleFontChange}
              />
            </div>
          </div>
        )}
      </SettingsCard>
    </>
  );
}
