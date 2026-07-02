import { error } from "@tauri-apps/plugin-log";
import { open } from "@tauri-apps/plugin-dialog";
import { DEFAULT_ACCENT_COLOR } from "../../../../settingsSchema";
import type { Settings } from "../../../../store";
import { SettingsCard } from "./shared";

const IMAGE_FILTERS = [
  {
    name: "Images",
    extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp"],
  },
];

const advancedLayoutOptions = [
  { value: "wide" as const, label: "Wide" },
  { value: "tall" as const, label: "Tall" },
];

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export default function AppearanceSection({ settings, update }: Props) {
  const handleBrowseBackgroundImage = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: IMAGE_FILTERS,
      });
      if (selected) {
        update({ backgroundImage: selected });
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
    <SettingsCard title="Appearance" description="Customize how the app looks.">
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
          <span className="settings-label">Advanced Layout</span>
          <span className="settings-sublabel">
            Panel layout for sequence zones.
          </span>
        </div>
        <div className="settings-seg-group">
          {advancedLayoutOptions.map((option) => (
            <button
              key={option.value}
              className={`settings-seg-btn ${settings.advancedSequenceLayout === option.value ? "active" : ""}`}
              onClick={() => update({ advancedSequenceLayout: option.value })}
            >
              {option.label}
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
            value={settings.backgroundImage}
            onChange={(event) =>
              update({ backgroundImage: event.target.value })
            }
            placeholder="https://example.com/image.png"
          />
          <div className="settings-bg-buttons">
            <button
              className="settings-btn-secondary"
              onClick={handleBrowseBackgroundImage}
            >
              Browse
            </button>
            <button
              className="settings-btn-danger settings-btn-danger--compact"
              onClick={() => update({ backgroundImage: "" })}
              disabled={!settings.backgroundImage}
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
            Transparency of the background image.
          </span>
        </div>
        <div className="settings-opacity-controls">
          <input
            type="range"
            className="settings-opacity-slider"
            min="0"
            max="100"
            value={settings.backgroundOpacity}
            disabled={!settings.backgroundImage}
            onChange={(event) =>
              update({ backgroundOpacity: Number(event.target.value) })
            }
          />
          <span className="settings-slider-value">
            {settings.backgroundOpacity}%
          </span>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">Panel Opacity</span>
          <span className="settings-sublabel">
            Transparency of the settings panel.
          </span>
        </div>
        <div className="settings-opacity-controls">
          <input
            type="range"
            className="settings-opacity-slider"
            min="0"
            max="100"
            value={settings.panelOpacity}
            onChange={(event) =>
              update({ panelOpacity: Number(event.target.value) })
            }
          />
          <span className="settings-slider-value">
            {settings.panelOpacity}%
          </span>
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
            value={settings.panelBlur}
            onChange={(event) =>
              update({ panelBlur: Number(event.target.value) })
            }
          />
          <span className="settings-slider-value">{settings.panelBlur}px</span>
        </div>
      </div>
    </SettingsCard>
  );
}
