import "./SettingsPanel.css";
import {
  lazy,
  Suspense,
  useCallback,
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
  Volume2Icon,
  WrenchIcon,
} from "@animateicons/react/lucide";
import type { AnimatedIcon } from "../../animatedIcon";
import type { AppInfo, PresetId, Settings } from "../../../store";
import type { RestartOutcome } from "../../../restart";
import { burstConfetti } from "../../../confetti";

import GeneralSection from "./sections/GeneralSection";
import BehaviorSection from "./sections/BehaviorSection";
import AppearanceSection from "./sections/AppearanceSection";
import OverlaySection from "./sections/OverlaySection";
import SoundsSection from "./sections/SoundsSection";
import PresetsSection from "./sections/PresetsSection";
import MaintenanceSection from "./sections/MaintenanceSection";
import KeybindsSection from "./sections/KeybindsSection";
import ProcessListSection from "./sections/ProcessListSection";
import { SettingsSearchInput, SettingsSearchResults } from "./SettingsSearch";
import type { SettingsSearchResult } from "../../../settingsSearch";

const DevToolsSection = import.meta.env.DEV
  ? lazy(() => import("./sections/DevToolsSection"))
  : null;

type SettingsTab =
  | "general"
  | "behavior"
  | "appearance"
  | "overlay"
  | "sounds"
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
  onRestartWithoutAdmin: () => Promise<RestartOutcome>;
  onOpenCustomizer: () => void;
  onReset: () => Promise<void>;
  updateCheckStatus:
    "idle" | "checking" | "available" | "unavailable" | "error";
  onCheckForUpdate: () => void;
  initialSettingsTab?: string;
  onInitialTabConsumed?: () => void;
  onOpenFirstRunSetup: () => void;
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
  onRestartWithoutAdmin,
  onOpenCustomizer,
  onReset,
  updateCheckStatus,
  onCheckForUpdate,
  initialSettingsTab,
  onInitialTabConsumed,
  onOpenFirstRunSetup,
}: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [search, setSearch] = useState("");
  const searchAnimation = useRef<number | null>(null);
  const searchValue = useRef("");
  const [jumpTo, setJumpTo] = useState<{
    label: string;
    nonce: number;
  } | null>(null);
  const [scrollState, setScrollState] = useState({
    atBottom: true,
    scrollable: false,
  });
  const [activeRect, setActiveRect] = useState<TabRect | null>(null);
  const [hoverRect, setHoverRect] = useState<TabRect | null>(null);
  const [hoverOn, setHoverOn] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const jumpTimerRef = useRef<number | undefined>(undefined);
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

  const handleScroll = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    // Without this the fade outlives the content: switching to a short tab (or
    // an empty search) fires no scroll event, so the old "not at bottom" state
    // kept the gradient on screen over nothing.
    const scrollable = panel.scrollHeight - panel.clientHeight > 2;
    setScrollState({
      scrollable,
      atBottom:
        !scrollable ||
        panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 2,
    });
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    handleScroll();
    const observer = new ResizeObserver(handleScroll);
    observer.observe(panel);
    // Sections also grow after mount (process list, fonts, stats), so watch the
    // content itself, not just the panel box.
    const mutations = new MutationObserver(handleScroll);
    mutations.observe(panel, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [activeTab, search, handleScroll]);

  const showSections = search.trim().length === 0;

  const stopSearchAnimation = useCallback(() => {
    if (searchAnimation.current !== null) {
      window.clearInterval(searchAnimation.current);
      searchAnimation.current = null;
    }
  }, []);

  // Clearing deletes the query one step at a time so the text types itself
  // back out, and the results thin out as it goes.
  const clearSearch = useCallback(
    (animate: boolean) => {
      stopSearchAnimation();
      if (!animate) {
        searchValue.current = "";
        setSearch("");
        return;
      }
      searchAnimation.current = window.setInterval(() => {
        const current = searchValue.current;
        if (current.length === 0) {
          stopSearchAnimation();
          return;
        }
        const step = Math.max(1, Math.ceil(current.length / 14));
        const next = current.slice(0, -step);
        searchValue.current = next;
        setSearch(next);
        if (next.length === 0) stopSearchAnimation();
      }, 18);
    },
    [stopSearchAnimation],
  );

  useEffect(() => () => stopSearchAnimation(), [stopSearchAnimation]);

  const handleQueryChange = useCallback(
    (next: string) => {
      stopSearchAnimation();
      searchValue.current = next;
      setSearch(next);
    },
    [stopSearchAnimation],
  );

  const handleTabSelect = useCallback(
    (tab: SettingsTab) => {
      if (search.trim().length > 0) clearSearch(true);
      setActiveTab(tab);
    },
    [search, clearSearch],
  );

  const handleSearchSelect = useCallback(
    (result: SettingsSearchResult) => {
      stopSearchAnimation();
      searchValue.current = "";
      setSearch("");
      setActiveTab(result.tab as SettingsTab);
      setJumpTo({ label: result.label, nonce: Date.now() });
    },
    [stopSearchAnimation],
  );

  // Land on the row the user picked: switch tab (done above), then scroll the
  // matching label into view and flash it so it is obvious which row it is.
  useEffect(() => {
    if (!jumpTo) return;
    const panel = panelRef.current;
    if (!panel) return;
    const frame = requestAnimationFrame(() => {
      const label = jumpTo.label.toLowerCase();
      const target = Array.from(
        panel.querySelectorAll<HTMLElement>(".settings-label"),
      ).find((node) => (node.textContent ?? "").trim().toLowerCase() === label);
      if (target) {
        const details = target.closest<HTMLElement>(".sound-details");
        const unfold = details?.querySelector<HTMLButtonElement>(
          ".sound-details-toggle",
        );
        const needsUnfold = Boolean(
          details && unfold && details.dataset.open !== "true",
        );
        if (needsUnfold) unfold?.click();
        const row = target.closest<HTMLElement>(".settings-row") ?? target;
        window.setTimeout(
          () => {
            if (typeof row.scrollIntoView === "function") {
              row.scrollIntoView({ block: "center" });
            }
            window.clearTimeout(jumpTimerRef.current);
            row.classList.remove("settings-row-jump");
            void row.offsetWidth;
            row.classList.add("settings-row-jump");
            jumpTimerRef.current = window.setTimeout(
              () => row.classList.remove("settings-row-jump"),
              1400,
            );
          },
          needsUnfold ? 240 : 0,
        );
      }
      setJumpTo(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [jumpTo, activeTab]);

  return (
    <div className="settings-wrapper">
      <nav className="settings-sidebar" ref={navRef}>
        <SettingsSearchInput query={search} onQueryChange={handleQueryChange} />
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
          onSelect={handleTabSelect}
        />
        <SidebarTab
          tab="behavior"
          label="Behavior"
          icon={ToggleRightIcon}
          active={activeTab === "behavior"}
          onHover={handleHover}
          onHoverEnd={handleHoverEnd}
          onSelect={handleTabSelect}
        />
        <SidebarTab
          tab="appearance"
          label="Appearance"
          icon={SunIcon}
          active={activeTab === "appearance"}
          onHover={handleHover}
          onHoverEnd={handleHoverEnd}
          onSelect={handleTabSelect}
        />
        <SidebarTab
          tab="overlay"
          label="Indicator"
          icon={PictureInPictureIcon}
          active={activeTab === "overlay"}
          onHover={handleHover}
          onHoverEnd={handleHoverEnd}
          onSelect={handleTabSelect}
        />
        <SidebarTab
          tab="sounds"
          label="Sounds"
          icon={Volume2Icon}
          active={activeTab === "sounds"}
          onHover={handleHover}
          onHoverEnd={handleHoverEnd}
          onSelect={handleTabSelect}
        />
        <SidebarTab
          tab="keybinds"
          label="Keybinds"
          icon={KeyboardIcon}
          active={activeTab === "keybinds"}
          onHover={handleHover}
          onHoverEnd={handleHoverEnd}
          onSelect={handleTabSelect}
        />
        <SidebarTab
          tab="process-list"
          label="Process List"
          icon={LayoutListIcon}
          active={activeTab === "process-list"}
          onHover={handleHover}
          onHoverEnd={handleHoverEnd}
          onSelect={handleTabSelect}
        />
        <SidebarTab
          tab="presets"
          label="Presets"
          icon={BookmarkIcon}
          active={activeTab === "presets"}
          onHover={handleHover}
          onHoverEnd={handleHoverEnd}
          onSelect={handleTabSelect}
        />
        <SidebarTab
          tab="maintenance"
          label="Maintenance"
          icon={WrenchIcon}
          active={activeTab === "maintenance"}
          onHover={handleHover}
          onHoverEnd={handleHoverEnd}
          onSelect={handleTabSelect}
        />
        {DevToolsSection && (
          <SidebarTab
            tab="dev"
            label="Dev tools"
            icon={SquareTerminalIcon}
            active={activeTab === "dev"}
            onHover={handleHover}
            onHoverEnd={handleHoverEnd}
            onSelect={handleTabSelect}
          />
        )}
        <a
          className="sidebar-kofi"
          href="#"
          title="Support me on Ko-fi"
          onMouseEnter={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            burstConfetti(
              rect.left + rect.width / 2,
              rect.top + rect.height * 0.3,
            );
          }}
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
        {!showSections && (
          <div className="settings-search-view">
            <SettingsSearchResults
              query={search}
              onSelect={handleSearchSelect}
            />
          </div>
        )}
        {showSections && activeTab === "general" && (
          <GeneralSection
            appInfo={appInfo}
            updateCheckStatus={updateCheckStatus}
            onCheckForUpdate={onCheckForUpdate}
          />
        )}
        {showSections && activeTab === "behavior" && (
          <BehaviorSection
            settings={settings}
            update={update}
            onToggleAlwaysOnTop={onToggleAlwaysOnTop}
            onRestartAsAdmin={onRestartAsAdmin}
            onRestartWithoutAdmin={onRestartWithoutAdmin}
            portable={appInfo.portable}
          />
        )}
        {showSections && activeTab === "appearance" && (
          <AppearanceSection
            settings={settings}
            update={update}
            onOpenCustomizer={onOpenCustomizer}
          />
        )}
        {showSections && activeTab === "overlay" && (
          <OverlaySection settings={settings} update={update} />
        )}
        {showSections && activeTab === "sounds" && (
          <SoundsSection settings={settings} update={update} />
        )}
        {showSections && activeTab === "keybinds" && (
          <KeybindsSection settings={settings} update={update} />
        )}
        {showSections && activeTab === "process-list" && (
          <div className="settings-proc-list-wrapper">
            <ProcessListSection settings={settings} update={update} />
          </div>
        )}
        {showSections && activeTab === "presets" && (
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
        {showSections && activeTab === "maintenance" && (
          <MaintenanceSection onReset={onReset} />
        )}
        {showSections && DevToolsSection && activeTab === "dev" && (
          <Suspense fallback={null}>
            <DevToolsSection onOpenFirstRunSetup={onOpenFirstRunSetup} />
          </Suspense>
        )}
      </div>
      <div
        className={`settings-fade ${
          scrollState.atBottom || !scrollState.scrollable
            ? "settings-fade--hidden"
            : ""
        }`}
      ></div>
    </div>
  );
}
