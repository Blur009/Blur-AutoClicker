import "./SettingsPanel.css";
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useIconHover } from "@animateicons/react";
import {
  BookmarkIcon,
  InfoIcon,
  KeyboardIcon,
  LayoutListIcon,
  PictureInPictureIcon,
  SquareTerminalIcon,
  SunIcon,
  ToggleRightIcon,
  WrenchIcon,
} from "@animateicons/react/lucide";
import type { AnimatedIcon } from "../../animatedIcon";
import type { AppInfo, PresetId, Settings } from "../../../store";
import type { RestartOutcome } from "../../../restart";

import GeneralSection from "./sections/GeneralSection";
import BehaviorSection from "./sections/BehaviorSection";
import AppearanceSection from "./sections/AppearanceSection";
import OverlaySection from "./sections/OverlaySection";
import PresetsSection from "./sections/PresetsSection";
import MaintenanceSection from "./sections/MaintenanceSection";
import KeybindsSection from "./sections/KeybindsSection";
import ProcessListSection from "./sections/ProcessListSection";

const DevToolsSection = import.meta.env.DEV
  ? lazy(() => import("./sections/DevToolsSection"))
  : null;

type SettingsTab =
  | "general"
  | "behavior"
  | "appearance"
  | "overlay"
  | "keybinds"
  | "process-list"
  | "presets"
  | "maintenance"
  | "dev";

type TabRect = { top: number; height: number; left: number; width: number };

function tabRect(el: HTMLElement | null): TabRect | null {
  return el
    ? {
        top: el.offsetTop,
        height: el.offsetHeight,
        left: el.offsetLeft,
        width: el.offsetWidth,
      }
    : null;
}

function SidebarTab({
  tab,
  label,
  icon: Icon,
  active,
  onSelect,
  onHover,
  onHoverEnd,
}: {
  tab: SettingsTab;
  label: string;
  icon: AnimatedIcon;
  active: boolean;
  onSelect: (tab: SettingsTab) => void;
  onHover: (el: HTMLElement | null) => void;
  onHoverEnd: () => void;
}) {
  const { ref, triggerProps } = useIconHover();

  return (
    <button
      {...triggerProps}
      onMouseEnter={(e) => {
        triggerProps.onMouseEnter?.(e);
        onHover(e.currentTarget);
      }}
      onMouseLeave={(e) => {
        triggerProps.onMouseLeave?.(e);
        onHoverEnd();
      }}
      className={`sidebar-tab ${active ? "active" : ""}`}
      onClick={() => onSelect(tab)}
    >
      <Icon
        ref={ref}
        size={16}
        isAnimated={false}
        className="tab-icon"
        aria-hidden="true"
      />
      {label}
    </button>
  );
}

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
  onDuplicatePreset: (presetId: PresetId) => boolean;
  onExportPreset: (presetId: PresetId) => Promise<boolean>;
  onImportPreset: () => Promise<boolean | null>;
  onToggleAlwaysOnTop: () => Promise<void>;
  onRestartAsAdmin: () => Promise<RestartOutcome>;
  onOpenCustomizer: () => void;
  onReset: () => Promise<void>;
  updateCheckStatus:
    "idle" | "checking" | "available" | "unavailable" | "error";
  onCheckForUpdate: () => void;
  initialSettingsTab?: string;
  onInitialTabConsumed?: () => void;
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
  onDuplicatePreset,
  onExportPreset,
  onImportPreset,
  onToggleAlwaysOnTop,
  onRestartAsAdmin,
  onOpenCustomizer,
  onReset,
  updateCheckStatus,
  onCheckForUpdate,
  initialSettingsTab,
  onInitialTabConsumed,
}: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [atBottom, setAtBottom] = useState(true);
  const [activeRect, setActiveRect] = useState<TabRect | null>(null);
  const [hoverRect, setHoverRect] = useState<TabRect | null>(null);
  const [hoverOn, setHoverOn] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const prevInitialTabRef = useRef<string | undefined>(undefined);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      setActiveRect(
        tabRect(nav.querySelector<HTMLElement>(".sidebar-tab.active")),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [activeTab]);

  const handleHover = (el: HTMLElement | null) => {
    const rect = tabRect(el);
    if (!rect) return;
    setHoverRect(rect);
    setHoverOn(true);
  };

  const handleHoverEnd = () => setHoverOn(false);

  useEffect(() => {
    if (
      initialSettingsTab &&
      initialSettingsTab !== prevInitialTabRef.current
    ) {
      prevInitialTabRef.current = initialSettingsTab;
      onInitialTabConsumed?.();
      const tab = initialSettingsTab as SettingsTab;
      requestAnimationFrame(() => {
        setActiveTab(tab);
      });
    }
  }, [initialSettingsTab, onInitialTabConsumed]);

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
      <nav className="settings-sidebar" ref={navRef}>
        <div
          className="sidebar-highlight sidebar-highlight-hover"
          data-ready={hoverRect !== null}
          data-visible={hoverOn}
          style={{
            transform: `translateY(${hoverRect?.top ?? 0}px)`,
            height: hoverRect?.height ?? 0,
            left: hoverRect?.left ?? 0,
            width: hoverRect?.width ?? 0,
          }}
        />
        <div
          className="sidebar-highlight sidebar-highlight-active"
          data-ready={activeRect !== null}
          style={{
            transform: `translateY(${activeRect?.top ?? 0}px)`,
            height: activeRect?.height ?? 0,
            left: activeRect?.left ?? 0,
            width: activeRect?.width ?? 0,
          }}
        />
        <SidebarTab
          tab="general"
          label="General"
          icon={InfoIcon}
          active={activeTab === "general"}
          onHover={handleHover}
          onHoverEnd={handleHoverEnd}
          onSelect={setActiveTab}
        />
        <SidebarTab
          tab="behavior"
          label="Behavior"
          icon={ToggleRightIcon}
          active={activeTab === "behavior"}
          onHover={handleHover}
          onHoverEnd={handleHoverEnd}
          onSelect={setActiveTab}
        />
        <SidebarTab
          tab="appearance"
          label="Appearance"
          icon={SunIcon}
          active={activeTab === "appearance"}
          onHover={handleHover}
          onHoverEnd={handleHoverEnd}
          onSelect={setActiveTab}
        />
        <SidebarTab
          tab="overlay"
          label="Indicator"
          icon={PictureInPictureIcon}
          active={activeTab === "overlay"}
          onHover={handleHover}
          onHoverEnd={handleHoverEnd}
          onSelect={setActiveTab}
        />
        <SidebarTab
          tab="keybinds"
          label="Keybinds"
          icon={KeyboardIcon}
          active={activeTab === "keybinds"}
          onHover={handleHover}
          onHoverEnd={handleHoverEnd}
          onSelect={setActiveTab}
        />
        <SidebarTab
          tab="process-list"
          label="Process List"
          icon={LayoutListIcon}
          active={activeTab === "process-list"}
          onHover={handleHover}
          onHoverEnd={handleHoverEnd}
          onSelect={setActiveTab}
        />
        <SidebarTab
          tab="presets"
          label="Presets"
          icon={BookmarkIcon}
          active={activeTab === "presets"}
          onHover={handleHover}
          onHoverEnd={handleHoverEnd}
          onSelect={setActiveTab}
        />
        <SidebarTab
          tab="maintenance"
          label="Maintenance"
          icon={WrenchIcon}
          active={activeTab === "maintenance"}
          onHover={handleHover}
          onHoverEnd={handleHoverEnd}
          onSelect={setActiveTab}
        />
        {DevToolsSection && (
          <SidebarTab
            tab="dev"
            label="Dev tools"
            icon={SquareTerminalIcon}
            active={activeTab === "dev"}
            onHover={handleHover}
            onHoverEnd={handleHoverEnd}
            onSelect={setActiveTab}
          />
        )}
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
            onRestartAsAdmin={onRestartAsAdmin}
            portable={appInfo.portable}
          />
        )}
        {activeTab === "appearance" && (
          <AppearanceSection
            settings={settings}
            update={update}
            onOpenCustomizer={onOpenCustomizer}
          />
        )}
        {activeTab === "overlay" && (
          <OverlaySection settings={settings} update={update} />
        )}
        {activeTab === "keybinds" && (
          <KeybindsSection settings={settings} update={update} />
        )}
        {activeTab === "process-list" && (
          <div className="settings-proc-list-wrapper">
            <ProcessListSection settings={settings} update={update} />
          </div>
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
            onDuplicatePreset={onDuplicatePreset}
            onExportPreset={onExportPreset}
            onImportPreset={onImportPreset}
          />
        )}
        {activeTab === "maintenance" && (
          <MaintenanceSection onReset={onReset} />
        )}
        {DevToolsSection && activeTab === "dev" && (
          <Suspense fallback={null}>
            <DevToolsSection />
          </Suspense>
        )}
      </div>
      <div
        className={`settings-fade ${atBottom ? "settings-fade--hidden" : ""}`}
      ></div>
    </div>
  );
}
