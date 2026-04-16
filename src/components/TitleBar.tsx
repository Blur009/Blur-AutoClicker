import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import type { Tab } from "../App";
import "./TitleBar.css";

const appWindow = getCurrentWindow();
const DEFAULT_TITLE = "BlurAutoClicker";

const handleMinimize = async () => await appWindow.minimize();

interface Props {
  tab: Tab;
  setTab: (t: Tab) => void;
  running: boolean;
  stopReason?: string | null;
  onRequestClose: () => Promise<void>;
}

type NavTab = Exclude<Tab, "settings">;

type TabIconProps = {
  active: boolean;
};

type TabItem = {
  value: NavTab;
  label: string;
  color: string;
  icon: (props: TabIconProps) => React.ReactNode;
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

const TAB_ITEMS: readonly TabItem[] = [
  {
    value: "simple",
    label: "Simple",
    color: "var(--accent-green)",
    icon: ({ active }) => (
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
    ),
  },
  {
    value: "advanced",
    label: "Advanced",
    color: "var(--accent-yellow)",
    icon: ({ active }) => (
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
    ),
  },
] as const;

export default function TitleBar({
  tab,
  setTab,
  running,
  stopReason,
  onRequestClose,
}: Props) {
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);

  const toggleAlwaysOnTop = async () => {
    try {
      const newState = !isAlwaysOnTop;
      await appWindow.setAlwaysOnTop(newState);
      setIsAlwaysOnTop(newState);
    } catch (err) {
      console.error("Failed to set always on top:", err);
    }
  };

  return (
    <div
      className="window-title-background"
      style={
        {
          WebkitAppRegion: "drag",
          WebkitUserSelect: "none",
        } as React.CSSProperties
      }
      data-tauri-drag-region
      data-running={running}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <button
          className="settings-button"
          data-active={tab === "settings"}
          onClick={() => setTab("settings")}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
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
                onClick={() => setTab(item.value)}
                color={item.color}
                icon={item.icon({ active: isActive })}
              />
            );
          })}
        </div>
      </div>

      <div className="title-wrapper">
        <AnimatedTitle running={running} stopReason={stopReason} />
      </div>

      <div
        style={
          {
            display: "flex",
            alignItems: "center",
            gap: "4px",
            WebkitAppRegion: "no-drag",
          } as React.CSSProperties
        }
      >
        <WindowBtn
          onClick={toggleAlwaysOnTop}
          active={isAlwaysOnTop}
          title={isAlwaysOnTop ? "Disable Always on Top" : "Enable Always on Top"}
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
          onClick={handleMinimize}
          label={
            <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
              <rect width="10" height="2" fill="currentColor" />
            </svg>
          }
        />
        <WindowBtn
          onClick={onRequestClose}
          danger
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

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

function AnimatedTitle({
  running,
  stopReason,
}: Pick<Props, "running" | "stopReason">) {
  const [titleState, setTitleState] = useState(DEFAULT_TITLE_STATE);
  const frameIdsRef = useRef<number[]>([]);
  const timeoutIdsRef = useRef<number[]>([]);

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

    if (running || !stopReason) {
      queueFrame(() => {
        setTitleState(DEFAULT_TITLE_STATE);
      });
      return clearScheduledWork;
    }

    queueFrame(() => {
      setTitleState((current) => ({ ...current, flipClass: "flip-out" }));
      queueDelay(() => {
        setTitleState({
          text: stopReason,
          isReason: true,
          flipClass: "",
        });

        queueFrame(() => {
          setTitleState((current) => ({ ...current, flipClass: "flip-in" }));
          queueDelay(() => {
            setTitleState((current) => ({ ...current, flipClass: "" }));
          }, 350);
        });

        queueDelay(() => {
          queueFrame(() => {
            setTitleState((current) => ({ ...current, flipClass: "flip-out" }));
            queueDelay(() => {
              setTitleState(DEFAULT_TITLE_STATE);
              queueFrame(() => {
                setTitleState((current) => ({ ...current, flipClass: "flip-in" }));
                queueDelay(() => {
                  setTitleState((current) => ({ ...current, flipClass: "" }));
                }, 350);
              });
            }, 350);
          });
        }, 5000);
      }, 400);
    });

    return clearScheduledWork;
  }, [running, stopReason]);

  return (
    <span
      className={`window-title title-flipper ${titleState.flipClass} ${titleState.isReason ? "is-reason" : ""}`}
    >
      {titleState.text}
    </span>
  );
}

function TabIconButton({
  icon,
  label,
  active,
  onClick,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className={`tab-icon-btn ${active ? "active" : ""}`}
      aria-label={label}
      title={label}
      style={
        {
          "--active-color": color,
          WebkitAppRegion: "no-drag",
        } as React.CSSProperties
      }
    >
      {icon}
    </button>
  );
}

function WindowBtn({
  onClick,
  label,
  danger,
  active,
  title,
}: {
  onClick: () => void;
  label: React.ReactNode;
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
