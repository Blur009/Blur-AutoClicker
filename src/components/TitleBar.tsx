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
  paused: boolean;
  stopReason?: string | null;
  stopKey: number;
  isAlwaysOnTop: boolean;
  onToggleAlwaysOnTop: () => Promise<void>;
  onRequestClose: () => Promise<void>;
  warning?: string | null;
}

type NavTab = Exclude<Tab, "settings">;

type TabIconProps = {
  active: boolean;
};

type TabItem = {
  value: NavTab;
  label: string;
  color: string;
  activeBg: string;
  activeFocusRing: string;
  icon: (props: TabIconProps) => ReactNode;
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
  "Stopped from UI": "Stopped from UI",
  "Stopped from toggle": "Stopped from toggle",
  "Stopped from hotkey": "Stopped from hotkey",
  "Stopped from hold hotkey": "Stopped from hold hotkey",
  Stopped: "Stopped",
  "Top-left corner failsafe": "Top-left corner failsafe",
  "Top-right corner failsafe": "Top-right corner failsafe",
  "Bottom-left corner failsafe": "Bottom-left corner failsafe",
  "Bottom-right corner failsafe": "Bottom-right corner failsafe",
  "Top edge failsafe": "Top edge failsafe",
  "Right edge failsafe": "Right edge failsafe",
  "Bottom edge failsafe": "Bottom edge failsafe",
  "Left edge failsafe": "Left edge failsafe",
  "Blocked by Alt+Tab": "Blocked by Alt+Tab",
  "Blocked by process list": "Blocked by process list",
};

function translateStopReason(stopReason: string | null | undefined): string {
  if (!stopReason) return "";
  const staticText = STOP_REASON_TEXTS[stopReason];
  if (staticText) return staticText;

  const clickLimit = stopReason.match(/^Click limit reached \((.+)\)$/);
  if (clickLimit) {
    return `Click limit reached (${clickLimit[1]})`;
  }

  const timeLimit = stopReason.match(/^Time limit reached \((.+)\)$/);
  if (timeLimit) {
    return `Time limit reached (${timeLimit[1]})`;
  }

  return stopReason;
}

const SimpleIcon = memo(function SimpleIcon({ active }: TabIconProps) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? "2.2" : "2"}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="7" y="3" width="10" height="18" rx="5" />
      <path d="M12 7v4" />
    </svg>
  );
});

const AdvancedIcon = memo(function AdvancedIcon({ active }: TabIconProps) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? "2.2" : "2"}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3z" />
      <path d="m3 12.5 9 4.5 9-4.5" />
      <path d="m3 17.5 9 4.5 9-4.5" />
    </svg>
  );
});

const ZonesIcon = memo(function ZonesIcon({ active }: TabIconProps) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? "2.2" : "2"}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
});

const SequenceIcon = memo(function SequenceIcon({ active }: TabIconProps) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? "2.2" : "2"}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6h16" />
      <path d="M4 12h12" />
      <path d="M4 18h8" />
      <circle cx="20" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="18" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
});

const TAB_ITEMS: readonly TabItem[] = [
  {
    value: "simple",
    label: "Simple",
    color: "var(--accent-green)",
    activeBg: "var(--accent-green-soft)",
    activeFocusRing: "var(--accent-green-ring)",
    icon: ({ active }) => <SimpleIcon active={active} />,
  },
  {
    value: "advanced",
    label: "Advanced",
    color: "var(--accent-yellow)",
    activeBg: "rgba(254, 188, 47, 0.1)",
    activeFocusRing: "rgba(254, 188, 47, 0.25)",
    icon: ({ active }) => <AdvancedIcon active={active} />,
  },
  {
    value: "zones",
    label: "Zones",
    color: "hsl(208 85% 58%)",
    activeBg: "hsla(208, 85%, 58%, 0.14)",
    activeFocusRing: "hsla(208, 85%, 58%, 0.35)",
    icon: ({ active }) => <ZonesIcon active={active} />,
  },
  {
    value: "sequence",
    label: "Sequence",
    color: "hsl(180 75% 40%)",
    activeBg: "hsla(180, 75%, 40%, 0.14)",
    activeFocusRing: "hsla(180, 75%, 40%, 0.35)",
    icon: ({ active }) => <SequenceIcon active={active} />,
  },
] as const;

const TitleBar = memo(function TitleBar({
  tab,
  setTab,
  running,
  paused,
  stopReason,
  stopKey,
  isAlwaysOnTop,
  onToggleAlwaysOnTop,
  onRequestClose,
  warning,
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
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
                icon={item.icon({ active: isActive })}
              />
            );
          })}
        </div>
      </div>

      <div className="title-wrapper">
        <AnimatedTitle
          running={running}
          paused={paused}
          stopReason={stopReason}
          stopKey={stopKey}
          warning={warning}
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
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 4h8l-1.4 5.2h-5.2L8 4z" />
              <path d="M6 9.2h12" />
              <path d="M12 9.2v10.8" />
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
  running,
  paused,
  stopReason,
  stopKey,
  warning,
}: Pick<Props, "running" | "paused" | "stopReason" | "stopKey" | "warning">) {
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

    if (warning) {
      lastShownStopReasonRef.current = null;
      queueFrame(() => {
        setTitleState({
          text: `⚠ ${warning}`,
          isReason: true,
          flipClass: "",
        });
      });
      return clearScheduledWork;
    }

    if (running && !paused && !stopReason) {
      lastShownStopReasonRef.current = null;
      queueFrame(() => {
        setTitleState(DEFAULT_TITLE_STATE);
      });
      return clearScheduledWork;
    }

    if (paused) {
      lastShownStopReasonRef.current = null;
      queueFrame(() => {
        setTitleState({
          text: stopReason
            ? `Paused: ${translateStopReason(stopReason)}`
            : "Paused",
          isReason: true,
          flipClass: "",
        });
      });
      return clearScheduledWork;
    }

    if (!stopReason) {
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
  }, [running, stopKey, warning, paused, stopReason]);

  return (
    <span
      className={`window-title title-flipper ${titleState.flipClass} ${titleState.isReason ? "is-reason" : ""}`}
    >
      {titleState.text}
    </span>
  );
}

const TabIconButton = memo(function TabIconButton({
  icon,
  label,
  active,
  onClick,
  value,
  color,
  activeBg,
  activeFocusRing,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: (value: NavTab) => void;
  value: NavTab;
  color: string;
  activeBg: string;
  activeFocusRing: string;
}) {
  return (
    <button
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => onClick(value)}
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
      {icon}
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
