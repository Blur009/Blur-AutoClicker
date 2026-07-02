import "./SettingsPanel.css";
import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { AppInfo, PresetId, Settings } from "../../../store";

import GeneralSection from "./sections/GeneralSection";
import BehaviorSection from "./sections/BehaviorSection";
import StartupSection from "./sections/StartupSection";
import AppearanceSection from "./sections/AppearanceSection";
import PresetsSection from "./sections/PresetsSection";
import MaintenanceSection from "./sections/MaintenanceSection";

type SettingsTab =
  | "general"
  | "behavior"
  | "startup"
  | "appearance"
  | "presets"
  | "maintenance";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  running: boolean;
  appInfo: AppInfo;
  onSavePreset: (name: string) => boolean;
  onApplyPreset: (presetId: PresetId) => boolean;
  onUpdatePreset: (presetId: PresetId) => boolean;
  onRenamePreset: (presetId: PresetId, name: string) => boolean;
  onDeletePreset: (presetId: PresetId) => boolean;
  onToggleAlwaysOnTop: () => Promise<void>;
  onReset: () => Promise<void>;
  updateCheckStatus:
    | "idle"
    | "checking"
    | "available"
    | "unavailable"
    | "error";
  onCheckForUpdate: () => void;
}

export default function SettingsPanel({
  settings,
  update,
  running,
  appInfo,
  onSavePreset,
  onApplyPreset,
  onUpdatePreset,
  onRenamePreset,
  onDeletePreset,
  onToggleAlwaysOnTop,
  onReset,
  updateCheckStatus,
  onCheckForUpdate,
}: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [atBottom, setAtBottom] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    const panel = panelRef.current;
    if (!panel) return;
    setAtBottom(panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 2);
  };

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new ResizeObserver(handleScroll);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [activeTab]);

  return (
    <div className="settings-wrapper">
      <nav className="settings-sidebar">
        <button
          className={`sidebar-tab ${activeTab === "general" ? "active" : ""}`}
          onClick={() => setActiveTab("general")}
        >
          {/* TODO: replace all settings page icons with better icons that fit the theme more. current icons are temporary stand-ins. */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
          </svg>
          General
        </button>
        <button
          className={`sidebar-tab ${activeTab === "behavior" ? "active" : ""}`}
          onClick={() => setActiveTab("behavior")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M17 6H7c-3.31 0-6 2.69-6 6s2.69 6 6 6h10c3.31 0 6-2.69 6-6s-2.69-6-6-6zm0 10H7c-2.21 0-4-1.79-4-4s1.79-4 4-4h10c2.21 0 4 1.79 4 4s-1.79 4-4 4zm0-7c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
          </svg>
          Behavior
        </button>
        <button
          className={`sidebar-tab ${activeTab === "startup" ? "active" : ""}`}
          onClick={() => setActiveTab("startup")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
          Startup
        </button>
        <button
          className={`sidebar-tab ${activeTab === "appearance" ? "active" : ""}`}
          onClick={() => setActiveTab("appearance")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z" />
          </svg>
          Appearance
        </button>
        <button
          className={`sidebar-tab ${activeTab === "presets" ? "active" : ""}`}
          onClick={() => setActiveTab("presets")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
          </svg>
          Presets
        </button>
        <button
          className={`sidebar-tab ${activeTab === "maintenance" ? "active" : ""}`}
          onClick={() => setActiveTab("maintenance")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" />
          </svg>
          Maintenance
        </button>
        <a
          className="sidebar-kofi"
          href="#"
          title="Support me on Ko-fi"
          onClick={(e) => {
            e.preventDefault();
            void openUrl("https://ko-fi.com/Z8Z71T8QD4");
          }}
        >
          <img
            src="https://storage.ko-fi.com/cdn/brandasset/v2/support_me_on_kofi_badge_blue.png"
            alt="Buy Me a Coffee at ko-fi.com"
          />
        </a>
      </nav>
      <div className="settings-corner" />
      <div className="settings-panel" ref={panelRef} onScroll={handleScroll}>
        {activeTab === "general" && (
          <GeneralSection
            appInfo={appInfo}
            updateCheckStatus={updateCheckStatus}
            onCheckForUpdate={onCheckForUpdate}
          />
        )}
        {activeTab === "behavior" && (
          <BehaviorSection
            settings={settings}
            update={update}
            onToggleAlwaysOnTop={onToggleAlwaysOnTop}
          />
        )}
        {activeTab === "startup" && (
          <StartupSection settings={settings} update={update} />
        )}
        {activeTab === "appearance" && (
          <AppearanceSection settings={settings} update={update} />
        )}
        {activeTab === "presets" && (
          <PresetsSection
            settings={settings}
            running={running}
            onSavePreset={onSavePreset}
            onApplyPreset={onApplyPreset}
            onUpdatePreset={onUpdatePreset}
            onRenamePreset={onRenamePreset}
            onDeletePreset={onDeletePreset}
          />
        )}
        {activeTab === "maintenance" && (
          <MaintenanceSection onReset={onReset} />
        )}
        <div
          className={`settings-fade ${atBottom ? "settings-fade--hidden" : ""}`}
        ></div>
      </div>
    </div>
  );
}
