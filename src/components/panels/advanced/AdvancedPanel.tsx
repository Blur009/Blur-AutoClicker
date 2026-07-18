import "./sections/shared.css";
import "./AdvancedPanel.css";
import type { Settings } from "../../../store";
import ClickSpeedSection from "./sections/ClickSpeedSection";
import HotkeySection from "./sections/HotkeySection";
import ClickerTypeSection from "./sections/ClickerTypeSection";
import DutyCycleSection from "./sections/DutyCycleSection";
import SpeedRandomizationSection from "./sections/SpeedRandomizationSection";
import LimitsSection from "./sections/LimitsSection";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

function AdvancedPanel({ settings, update }: Props) {
  return (
    <div className="adv-panel adv-panel-text adv-panel--grid">
      <ClickSpeedSection settings={settings} update={update} />
      <HotkeySection settings={settings} update={update} />
      <ClickerTypeSection settings={settings} update={update} />
      <LimitsSection settings={settings} update={update} />
      <DutyCycleSection settings={settings} update={update} />
      <SpeedRandomizationSection settings={settings} update={update} />
    </div>
  );
}

export default AdvancedPanel;
