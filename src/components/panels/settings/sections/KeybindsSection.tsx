import { memo, useCallback, useMemo } from "react";
import type { Settings } from "../../../../store";
import KeyCaptureInput from "../../../KeyCaptureInput";
import { SettingsCard } from "./shared";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const PAGES = [
  { key: "keybindSimple" as const, label: "Simple" },
  { key: "keybindAdvanced" as const, label: "Advanced" },
  { key: "keybindZones" as const, label: "Zones" },
  { key: "keybindClickPoints" as const, label: "Click Points" },
  { key: "keybindSettings" as const, label: "Settings" },
];

const TOGGLE_GROUPS: {
  title: string;
  items: { key: keyof Settings; label: string; sublabel: string }[];
}[] = [
  {
    title: "Advanced",
    items: [
      {
        key: "keybindMode",
        label: "Click Mode",
        sublabel: "Cycle Toggle / Hold.",
      },
      {
        key: "keybindInputType",
        label: "Input Type",
        sublabel: "Cycle Mouse / Keyboard.",
      },
      {
        key: "keybindDoubleClick",
        label: "Double Click",
        sublabel: "Toggle on or off.",
      },
      {
        key: "keybindDutyCycleMode",
        label: "Duty Cycle",
        sublabel: "Cycle Click / Hold.",
      },
      {
        key: "keybindSpeedRandomization",
        label: "Speed Randomization",
        sublabel: "Toggle on or off.",
      },
      {
        key: "keybindLimits",
        label: "Limits",
        sublabel: "Toggle the active click/time limit.",
      },
    ],
  },
  {
    title: "Zones",
    items: [
      {
        key: "keybindCornerStop",
        label: "Corner Stop",
        sublabel: "Toggle on or off.",
      },
      {
        key: "keybindEdgeStop",
        label: "Edge Stop",
        sublabel: "Toggle on or off.",
      },
      {
        key: "keybindStopZones",
        label: "Custom Stop Zones",
        sublabel: "Toggle on or off.",
      },
    ],
  },
  {
    title: "Click Points",
    items: [
      {
        key: "keybindToggleClickPoints",
        label: "Click Points",
        sublabel: "Toggle on or off.",
      },
      {
        key: "keybindStopWhenComplete",
        label: "Stop When Complete",
        sublabel: "Toggle on or off.",
      },
    ],
  },
];

interface KeybindRowProps {
  label: string;
  sublabel: string;
  value: string;
  onChange: (key: string) => void;
}

const KeybindRow = memo(function KeybindRow({
  label,
  sublabel,
  value,
  onChange,
}: KeybindRowProps) {
  return (
    <div className="settings-row">
      <div className="settings-label-group">
        <span className="settings-label">{label}</span>
        <span className="settings-sublabel">{sublabel}</span>
      </div>
      <KeyCaptureInput
        className="settings-keybind-capture"
        value={value}
        onChange={onChange}
      />
    </div>
  );
});

export default function KeybindsSection({ settings, update }: Props) {
  const handleMasterKeyChange = useCallback(
    (key: string) => update({ keybindMaster: key }),
    [update],
  );

  const handleMasterModeToggle = useCallback(
    () => update({ masterKeybindMode: "toggle" }),
    [update],
  );

  const handleMasterModeHold = useCallback(
    () => update({ masterKeybindMode: "hold" }),
    [update],
  );

  const pageHandlers = useMemo(
    () =>
      Object.fromEntries(
        PAGES.map((page) => [
          page.key,
          (key: string) => update({ [page.key]: key }),
        ]),
      ) as Record<(typeof PAGES)[number]["key"], (key: string) => void>,
    [update],
  );

  const toggleHandlers = useMemo(() => {
    const handlers = {} as Record<string, (key: string) => void>;
    for (const group of TOGGLE_GROUPS) {
      for (const item of group.items) {
        handlers[item.key] = (key: string) => update({ [item.key]: key });
      }
    }
    return handlers;
  }, [update]);
  return (
    <>
      <SettingsCard
        title="Master Switch"
        description="Bind a key that globally enables or disables the autoclicker. When off, the main activation keybind will not start it. Empty by default (always allowed)."
      >
        <KeybindRow
          label="Master Key"
          sublabel="Toggle disables/enables on press. Hold keeps it enabled while held."
          value={settings.keybindMaster}
          onChange={handleMasterKeyChange}
        />
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">Master Key Mode</span>
            <span className="settings-sublabel">
              Toggle: press to flip. Hold: autoclicker runs only while held.
            </span>
          </div>
          <div className="settings-seg-group">
            <button
              type="button"
              className={`settings-seg-btn ${settings.masterKeybindMode === "toggle" ? "active" : ""}`}
              onClick={handleMasterModeToggle}
            >
              Toggle
            </button>
            <button
              type="button"
              className={`settings-seg-btn ${settings.masterKeybindMode === "hold" ? "active" : ""}`}
              onClick={handleMasterModeHold}
            >
              Hold
            </button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Keybinds"
        description="Set a keyboard shortcut for each page. Press the key you want to bind."
      >
        {PAGES.map((page) => (
          <KeybindRow
            key={page.key}
            label={page.label}
            sublabel={`Switch to the ${page.label} page.`}
            value={settings[page.key]}
            onChange={pageHandlers[page.key]}
          />
        ))}
      </SettingsCard>

      {TOGGLE_GROUPS.map((group) => (
        <SettingsCard
          key={group.title}
          title={`${group.title} Toggle Keybinds`}
          description="Bind a key to flip a setting from anywhere in the app. Empty by default."
        >
          {group.items.map((item) => (
            <KeybindRow
              key={item.key}
              label={item.label}
              sublabel={item.sublabel}
              value={settings[item.key] as string}
              onChange={toggleHandlers[item.key]}
            />
          ))}
        </SettingsCard>
      ))}
    </>
  );
}
