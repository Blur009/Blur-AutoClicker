import { error } from "@tauri-apps/plugin-log";
import { open } from "@tauri-apps/plugin-dialog";
import { DEFAULT_ACCENT_COLOR } from "../../../../settingsSchema";
import type { IconColor, IconTheme } from "../../../../settingsSchema";
import type { Settings } from "../../../../store";
import { SettingsCard } from "./shared";

const IMAGE_FILTERS = [
  {
    name: "Images",
    extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp"],
  },
];

const PAGES = [
  { suffix: "Simple", label: "Simple Page" },
  { suffix: "Advanced", label: "Advanced Page" },
  { suffix: "Zones", label: "Zones Page" },
  { suffix: "ClickPoints", label: "Click Points Page" },
  { suffix: "Settings", label: "Settings Page" },
] as const;

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

function PageAppearanceControls({
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

  const bgImage = settings[bgImageKey] as string;
  const bgOpacity = settings[bgOpacityKey] as number;
  const winOpacity = settings[winOpacityKey] as number;
  const panelOpacity = settings[panelOpacityKey] as number;
  const panelBlur = settings[panelBlurKey] as number;

  const handleBrowse = async () => {
    try {
      const selected = await open({ multiple: false, filters: IMAGE_FILTERS });
      if (selected) {
        update({ [bgImageKey]: selected });
      }
    } catch (err) {
      error(
        JSON.stringify({
          source: "SettingsPanel.pickImage",
          error: String(err),
        }),
      );
    }
  };

  return (
    <>
      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Background Image</span>
          <span className="settings-sublabel">
            Path or URL to a background image.
          </span>
        </div>
        <div className="settings-bg-image-row">
          <input
            className="settings-bg-input"
            type="text"
            value={bgImage}
            onChange={(e) => update({ [bgImageKey]: e.target.value })}
            placeholder="https://example.com/image.png"
          />
          <div className="settings-bg-buttons">
            <button className="settings-btn-secondary" onClick={handleBrowse}>
              Browse
            </button>
            <button
              className="settings-btn-danger settings-btn-danger--compact"
              onClick={() => update({ [bgImageKey]: "" })}
              disabled={!bgImage}
            >
              Remove
            </button>
          </div>
        </div>
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
            onChange={(e) =>
              update({ [winOpacityKey]: Number(e.target.value) })
            }
          />
          <span className="settings-slider-value">{winOpacity}%</span>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Background Image Opacity</span>
          <span className="settings-sublabel">
            Transparency of the background image.
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
            onChange={(e) => update({ [bgOpacityKey]: Number(e.target.value) })}
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
            onChange={(e) =>
              update({ [panelOpacityKey]: Number(e.target.value) })
            }
          />
          <span className="settings-slider-value">{panelOpacity}%</span>
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
            onChange={(e) => update({ [panelBlurKey]: Number(e.target.value) })}
          />
          <span className="settings-slider-value">{panelBlur}px</span>
        </div>
      </div>
    </>
  );
}

export default function AppearanceSection({ settings, update }: Props) {
  const isPerPage = settings.perPageAppearance;

  const handleModeChange = (individual: boolean) => {
    update({ perPageAppearance: individual });
  };

  const themeAccent = (
    <SettingsCard title="Theme & Accent" description="Applied to all pages.">
      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Theme</span>
          <span className="settings-sublabel">
            Choose between dark and light mode.
          </span>
        </div>
        <div className="settings-seg-group">
          {(["dark", "light"] as const).map((theme) => (
            <button
              key={theme}
              className={`settings-seg-btn ${settings.theme === theme ? "active" : ""}`}
              onClick={() => update({ theme })}
            >
              {theme === "dark" ? "Dark" : "Light"}
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
              value={settings.accentColor}
              onChange={(event) => update({ accentColor: event.target.value })}
            />
          </label>
          <span className="settings-value settings-value--mono">
            {settings.accentColor.toUpperCase()}
          </span>
          <button
            className="settings-btn-secondary"
            onClick={() => update({ accentColor: DEFAULT_ACCENT_COLOR })}
            disabled={settings.accentColor === DEFAULT_ACCENT_COLOR}
          >
            Reset
          </button>
        </div>
      </div>
    </SettingsCard>
  );

  return (
    <>
      {themeAccent}

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
              onClick={() =>
                update({ taskbarIconEnabled: !settings.taskbarIconEnabled })
              }
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
            {(["auto", "dark", "light"] as IconTheme[]).map((opt) => (
              <button
                key={opt}
                className={`settings-seg-btn ${settings.taskbarIconTheme === opt ? "active" : ""}`}
                onClick={() => update({ taskbarIconTheme: opt })}
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
            {(["theme", "default"] as IconColor[]).map((opt) => (
              <button
                key={opt}
                className={`settings-seg-btn ${settings.taskbarIconColor === opt ? "active" : ""}`}
                onClick={() =>
                  settings.taskbarIconEnabled &&
                  update({ taskbarIconColor: opt })
                }
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
              onClick={() =>
                update({ statusBarEnabled: !settings.statusBarEnabled })
              }
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>
      </SettingsCard>
    </>
  );
}
