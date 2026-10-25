import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { IconHandle } from "@animateicons/react";
import {
  CircleDotIcon,
  LayersIcon,
  LayoutGridIcon,
  MouseIcon,
} from "@animateicons/react/lucide";
import type { AnimatedIcon } from "./animatedIcon";
import type { Tab } from "../App";

import "./TitleBar.css";

const appWindow = getCurrentWindow();
const DEFAULT_TITLE = "BlurAutoClicker";

async function handleMinimize() {
  await appWindow.minimize();
}

interface Props {
  tab: Tab;
  setTab: (t: Tab) => void;
  running: boolean;
  isAlwaysOnTop: boolean;
  onToggleAlwaysOnTop: () => Promise<void>;
  onRequestClose: () => Promise<void>;
  stopReason: string | null;
  statusBarHidden: boolean;
  masterOff: boolean;
}

type NavTab = Exclude<Tab, "settings">;

type TabItem = {
  value: NavTab;
  label: string;
  color: string;
  activeBg: string;
  activeFocusRing: string;
  icon: AnimatedIcon;
};

type TitleViewState = {
  text: string;
  flipClass: string;
  isReason: boolean;
};

const DEFAULT_TITLE_STATE: TitleViewState = {
  text: DEFAULT_TITLE,
  flipClass: "",
  isReason: false,
};

const STOP_REASON_TEXTS: Record<string, string> = {
  "Stopped from UI": "Stopped",
  "Stopped from toggle": "Stopped",
  "Stopped from hotkey": "Stopped",
  "Stopped from hold hotkey": "Stopped",
  Stopped: "Stopped",
  "Top-left corner failsafe": "Corner failsafe",
  "Top-right corner failsafe": "Corner failsafe",
  "Bottom-left corner failsafe": "Corner failsafe",
  "Bottom-right corner failsafe": "Corner failsafe",
  "Top edge failsafe": "Edge failsafe",
  "Right edge failsafe": "Edge failsafe",
  "Bottom edge failsafe": "Edge failsafe",
  "Left edge failsafe": "Edge failsafe",
  "Blocked by Alt+Tab": "Blocked by Alt+Tab",
  "Blocked by process list": "Blocked by process list",
  "Blocked by process list: foreground application could not be identified":
    "Could not identify the app in front",
};

function translateStopReason(stopReason: string | null | undefined): string {
  if (!stopReason) return "";
  const staticText = STOP_REASON_TEXTS[stopReason];
  if (staticText) return staticText;

  const clickLimit = stopReason.match(/^Click limit reached \((.+)\)$/);
  if (clickLimit) return "Click limit reached";

  const timeLimit = stopReason.match(/^Time limit reached \((.+)\)$/);
  if (timeLimit) return "Time limit reached";

  return stopReason;
}

const TAB_ITEMS: readonly TabItem[] = [
  {
    value: "simple",
    label: "Simple",
    color: "var(--accent)",
    activeBg: "var(--accent-soft)",
    activeFocusRing: "var(--accent-ring)",
    icon: MouseIcon,
  },
  {
    value: "advanced",
    label: "Advanced",
    color: "var(--accent-yellow)",
    activeBg: "rgba(254, 188, 47, 0.1)",
    activeFocusRing: "rgba(254, 188, 47, 0.25)",
    icon: LayersIcon,
  },
  {
    value: "zones",
    label: "Zones",
    color: "hsl(208 85% 58%)",
    activeBg: "hsla(208, 85%, 58%, 0.14)",
    activeFocusRing: "hsla(208, 85%, 58%, 0.35)",
    icon: LayoutGridIcon,
  },
  {
    value: "click-points",
    label: "Click Points",
    color: "hsl(180 75% 40%)",
    activeBg: "hsla(180, 75%, 40%, 0.14)",
    activeFocusRing: "hsla(180, 75%, 40%, 0.35)",
    icon: CircleDotIcon,
  },
] as const;

const TitleBar = memo(function TitleBar({
  tab,
  setTab,
  running,
  isAlwaysOnTop,
  onToggleAlwaysOnTop,
  onRequestClose,
  stopReason,
  statusBarHidden,
  masterOff,
}: Props) {
  const setTabRef = useRef(setTab);
  useEffect(() => {
    setTabRef.current = setTab;
  }, [setTab]);

  const handleTabClick = useCallback((value: NavTab) => {
    setTabRef.current(value);
  }, []);

  const handleSettingsClick = useCallback(() => {
    setTabRef.current("settings");
  }, []);

  return (
    <div
      className="window-title-background"
      style={
        {
          WebkitAppRegion: "drag",
          WebkitUserSelect: "none",
        } as CSSProperties
      }
      data-tauri-drag-region
      data-running={running}
      data-tab={tab}
      data-master-off={masterOff}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <button
          className="settings-button"
          data-active={tab === "settings"}
          onClick={handleSettingsClick}
          title="Settings"
          aria-label="Settings"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <svg
            className="settings-svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
          </svg>
        </button>
        <div className="tab-icon-group">
          {TAB_ITEMS.map((item) => {
            const isActive = tab === item.value;
            return (
              <TabIconButton
                key={item.value}
                label={item.label}
                active={isActive}
                onClick={handleTabClick}
                value={item.value}
                color={item.color}
                activeBg={item.activeBg}
                activeFocusRing={item.activeFocusRing}
                icon={item.icon}
              />
            );
          })}
        </div>
      </div>

      <div className="title-wrapper">
        <AnimatedTitle
          statusBarHidden={statusBarHidden}
          stopReason={stopReason}
          running={running}
        />
      </div>

      <div
        style={
          {
            display: "flex",
            alignItems: "center",
            gap: "4px",
            WebkitAppRegion: "no-drag",
          } as CSSProperties
        }
      >
        {masterOff && (
          <span
            className="master-off-badge"
            title="Master switch off — clicker blocked"
          >
            MASTER OFF
          </span>
        )}
        <WindowBtn
          onClick={() => {
            void onToggleAlwaysOnTop();
          }}
          active={isAlwaysOnTop}
          title={
            isAlwaysOnTop ? "Disable Always on Top" : "Enable Always on Top"
          }
          label={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="none"
              className="lucide lucide-pin-icon lucide-pin"
            >
              <path
                className="pin-body"
                d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
              />
              <g className="pin-needle">
                <path d="M-1 0h2v5H-1z" />
              </g>
            </svg>
          }
        />
        <WindowBtn
          onClick={() => {
            void handleMinimize();
          }}
          title="Minimize"
          label={
            <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
              <rect width="10" height="2" fill="currentColor" />
            </svg>
          }
        />
        <WindowBtn
          onClick={() => {
            void onRequestClose();
          }}
          danger
          title="Close"
          label={
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path
                d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          }
        />
      </div>
    </div>
  );
});

function AnimatedTitle({
  statusBarHidden,
  stopReason,
  running,
}: {
  statusBarHidden: boolean;
  stopReason: string | null;
  running: boolean;
}) {
  const [titleState, setTitleState] = useState(DEFAULT_TITLE_STATE);
  const frameIdsRef = useRef<number[]>([]);
  const timeoutIdsRef = useRef<number[]>([]);
  const lastShownStopReasonRef = useRef<string | null | undefined>(null);

  const clearScheduledWork = () => {
    frameIdsRef.current.forEach((id) => window.cancelAnimationFrame(id));
    timeoutIdsRef.current.forEach((id) => window.clearTimeout(id));
    frameIdsRef.current = [];
    timeoutIdsRef.current = [];
  };

  const queueFrame = (fn: () => void) => {
    const id = window.requestAnimationFrame(fn);
    frameIdsRef.current.push(id);
  };

  const queueDelay = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timeoutIdsRef.current.push(id);
  };

  useEffect(() => {
    clearScheduledWork();

    if (!statusBarHidden || !stopReason) {
      lastShownStopReasonRef.current = null;
      queueFrame(() => {
        setTitleState(DEFAULT_TITLE_STATE);
      });
      return clearScheduledWork;
    }

    if (running) {
      lastShownStopReasonRef.current = null;
      queueFrame(() => {
        setTitleState(DEFAULT_TITLE_STATE);
      });
      return clearScheduledWork;
    }

    if (stopReason === lastShownStopReasonRef.current) {
      return clearScheduledWork;
    }

    lastShownStopReasonRef.current = stopReason;

    queueFrame(() => {
      setTitleState({
        text: translateStopReason(stopReason),
        isReason: true,
        flipClass: "squish-in",
      });
    });
    queueDelay(() => {
      setTitleState((current) => ({ ...current, flipClass: "" }));
    }, 250);

    queueDelay(() => {
      setTitleState(DEFAULT_TITLE_STATE);
      setTitleState((current) => ({ ...current, flipClass: "squish-in" }));
      queueDelay(() => {
        setTitleState((current) => ({ ...current, flipClass: "" }));
      }, 250);
    }, 5000);

    return clearScheduledWork;
  }, [statusBarHidden, stopReason, running]);

  return (
    <span
      className={`window-title title-flipper ${titleState.flipClass} ${titleState.isReason ? "is-reason" : ""}`}
    >
      {titleState.text}
    </span>
  );
}

const TabIconButton = memo(function TabIconButton({
  icon: Icon,
  label,
  active,
  onClick,
  value,
  color,
  activeBg,
  activeFocusRing,
}: {
  icon: AnimatedIcon;
  label: string;
  active: boolean;
  onClick: (value: NavTab) => void;
  value: NavTab;
  color: string;
  activeBg: string;
  activeFocusRing: string;
}) {
  const iconRef = useRef<IconHandle>(null);

  const handleMouseEnter = () => {
    if (Math.random() < 0.1) iconRef.current?.startAnimation();
  };

  return (
    <button
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => onClick(value)}
      onMouseEnter={handleMouseEnter}
      className={`tab-icon-btn ${active ? "active" : ""}`}
      aria-label={label}
      title={label}
      style={
        {
          "--active-color": color,
          "--active-bg": activeBg,
          "--active-focus-ring": activeFocusRing,
          WebkitAppRegion: "no-drag",
        } as CSSProperties
      }
    >
      <Icon ref={iconRef} size={18} isAnimated={false} aria-hidden="true" />
    </button>
  );
});

export default TitleBar;

function WindowBtn({
  onClick,
  label,
  danger,
  active,
  title,
}: {
  onClick: () => void;
  label: ReactNode;
  danger?: boolean;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`window-btn ${danger ? "window-btn-danger" : ""} ${active ? "active" : ""}`}
    >
      {label}
    </button>
  );
}
