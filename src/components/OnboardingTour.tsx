import "./OnboardingTour.css";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { useEffect, useRef } from "react";
import type { Tab } from "../App";

interface Props {
  active: boolean;
  onComplete: () => void;
  setTab: (tab: Tab) => void;
}

type TourTab = Tab;

const STEP_TABS: TourTab[] = [
  "simple",   // 0  Welcome
  "simple",   // 1  Simple panel overview
  "simple",   // 2  Click speed
  "simple",   // 3  Hotkey
  "simple",   // 4  Quick controls  ← last simple step
  "advanced", // 5  Advanced cadence ← first advanced step
  "advanced", // 6  Duty cycle
  "advanced", // 7  Speed variation
  "advanced", // 8  Limits          ← last advanced step
  "settings", // 9  Settings overview ← first settings step
  "settings", // 10 Theme & Accent
  "settings", // 11 Presets
  "settings", // 12 Restart tour button (final)
];

const LAST_SIMPLE_IDX = 4;
const FIRST_ADV_IDX = 5;
const LAST_ADV_IDX = 8;
const FIRST_SETTINGS_IDX = 9;

export default function OnboardingTour({ active, onComplete, setTab }: Props) {
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);

  const startTour = (startIndex = 0) => {
    driverRef.current?.destroy();

    const targetTab = STEP_TABS[startIndex] ?? "simple";
    setTab(targetTab);

    const steps: DriveStep[] = [
      // ─── Simple Tab ──────────────────────────────────────────────────────
      {
        popover: {
          title: "Welcome to Blur AutoClicker!",
          description:
            "Let me walk you through the main features in about a minute. You can skip at any time by pressing Escape or clicking ✕.",
          showButtons: ["next", "close"],
        },
      },
      {
        element: '[data-tour="simple-panel"]',
        popover: {
          title: "Simple Mode",
          description:
            "The Simple tab gives you instant access to all core controls — compact and efficient for everyday use.",
          side: "bottom",
          align: "center",
        },
      },
      {
        element: '[data-tour="simple-cadence"]',
        popover: {
          title: "Click Speed",
          description:
            "Set how many clicks per second (or per minute / hour / day). Scroll the number or type directly — it updates in real time.",
          side: "bottom",
          align: "center",
        },
      },
      {
        element: '[data-tour="simple-hotkey"]',
        popover: {
          title: "Hotkey",
          description:
            "Click here and press any key combo to assign a toggle shortcut — so you can start and stop clicking without touching the mouse.",
          side: "bottom",
          align: "center",
        },
      },
      {
        element: '[data-tour="simple-controls"]',
        popover: {
          title: "Quick Controls",
          description:
            "Left-click to cycle forward, right-click to cycle backward. Switch the active mouse button (Left / Middle / Right) and click mode (Toggle / Hold).",
          side: "top",
          align: "center",
          onNextClick: () => {
            setTab("advanced");
            setTimeout(() => driverRef.current?.moveTo(FIRST_ADV_IDX), 220);
          },
        },
      },

      // ─── Advanced Tab ─────────────────────────────────────────────────────
      {
        element: '[data-tour="adv-cadence"]',
        popover: {
          title: "Advanced Click Speed",
          description:
            "Full cadence control: choose rate mode (clicks / s) or duration mode, and see the exact millisecond interval between clicks.",
          side: "right",
          align: "start",
          onPrevClick: () => {
            setTab("simple");
            setTimeout(() => driverRef.current?.moveTo(LAST_SIMPLE_IDX), 220);
          },
        },
      },
      {
        element: '[data-tour="adv-dutycycle"]',
        popover: {
          title: "Duty Cycle",
          description:
            "Controls how long the mouse button is physically held down per click. 100 % = always held, 10 % = brief tap. Great for games that distinguish press vs. hold.",
          side: "right",
          align: "start",
        },
      },
      {
        element: '[data-tour="adv-speed"]',
        popover: {
          title: "Speed Variation",
          description:
            "Adds random jitter to the click interval to mimic human behavior and avoid detection patterns in competitive games.",
          side: "right",
          align: "start",
        },
      },
      {
        element: '[data-tour="adv-limits"]',
        popover: {
          title: "Click & Time Limits",
          description:
            "Set a maximum number of clicks or a time limit. The clicker stops automatically when reached — no need to babysit it.",
          side: "left",
          align: "start",
          onNextClick: () => {
            setTab("settings");
            setTimeout(() => driverRef.current?.moveTo(FIRST_SETTINGS_IDX), 220);
          },
        },
      },

      // ─── Settings Tab ──────────────────────────────────────────────────────
      {
        element: '[data-tour="settings-panel"]',
        popover: {
          title: "Settings",
          description:
            "Customize theme, language, hotkey behavior, window options, and more. Everything persists across restarts automatically.",
          side: "bottom",
          align: "center",
          onPrevClick: () => {
            setTab("advanced");
            setTimeout(() => driverRef.current?.moveTo(LAST_ADV_IDX), 220);
          },
        },
      },
      {
        element: '[data-tour="settings-theme"]',
        popover: {
          title: "Theme & Accent",
          description:
            "Switch between Dark and Light mode, then pick any accent color from the color picker to personalize the UI.",
          side: "top",
          align: "end",
        },
      },
      {
        element: '[data-tour="settings-presets"]',
        popover: {
          title: "Presets",
          description:
            "Save your current configuration as a named preset and switch between them instantly. Perfect for different games or tasks.",
          side: "top",
          align: "end",
        },
      },
      {
        element: '[data-tour="settings-tour-btn"]',
        popover: {
          title: "You're all set!",
          description:
            "You can restart this tour anytime by clicking the button below. Enjoy Blur AutoClicker!",
          showButtons: ["previous", "close"],
          side: "top",
          align: "end",
        },
      },
    ];

    const driverInstance = driver({
      showProgress: true,
      progressText: "{{current}} / {{total}}",
      animate: true,
      overlayColor: "rgba(0, 0, 0, 0.55)",
      popoverClass: "onboarding-popover",
      nextBtnText: "Next →",
      prevBtnText: "← Back",
      doneBtnText: "Done",
      steps,
      onDestroyStarted: () => {
        driverInstance.destroy();
        onComplete();
      },
    });

    driverRef.current = driverInstance;
    driverInstance.drive(startIndex);
  };

  useEffect(() => {
    if (!active) return;

    const timeout = setTimeout(() => startTour(0), 650);
    return () => {
      clearTimeout(timeout);
      driverRef.current?.destroy();
      driverRef.current = null;
    };
    // startTour captures setTab/onComplete via closure — intentionally not in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return null;
}
