import "./SettingsPanel.css";
import { useEffect, useRef, useState } from "react";
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
          General
        </button>
        <button
          className={`sidebar-tab ${activeTab === "behavior" ? "active" : ""}`}
          onClick={() => setActiveTab("behavior")}
        >
          Behavior
        </button>
        <button
          className={`sidebar-tab ${activeTab === "startup" ? "active" : ""}`}
          onClick={() => setActiveTab("startup")}
        >
          Startup
        </button>
        <button
          className={`sidebar-tab ${activeTab === "appearance" ? "active" : ""}`}
          onClick={() => setActiveTab("appearance")}
        >
          Appearance
        </button>
        <button
          className={`sidebar-tab ${activeTab === "presets" ? "active" : ""}`}
          onClick={() => setActiveTab("presets")}
        >
          Presets
        </button>
        <button
          className={`sidebar-tab ${activeTab === "maintenance" ? "active" : ""}`}
          onClick={() => setActiveTab("maintenance")}
        >
          Maintenance
        </button>
      </nav>
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
