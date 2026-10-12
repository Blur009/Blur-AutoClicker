import { memo } from "react";
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
  update: PatchFn;
}

type PatchFn = (patch: Partial<Settings>) => void;

const MemoClickSpeedSection = memo(ClickSpeedSection);
const MemoHotkeySection = memo(HotkeySection);
const MemoClickerTypeSection = memo(ClickerTypeSection);
const MemoLimitsSection = memo(LimitsSection);
const MemoDutyCycleSection = memo(DutyCycleSection);
const MemoSpeedRandomizationSection = memo(SpeedRandomizationSection);

function AdvancedPanel({ settings, update }: Props) {
  return (
    <div className="adv-panel adv-panel-text adv-panel--grid">
      <MemoClickSpeedSection settings={settings} update={update} />
      <MemoHotkeySection settings={settings} update={update} />
      <MemoClickerTypeSection settings={settings} update={update} />
      <MemoLimitsSection settings={settings} update={update} />
      <MemoDutyCycleSection settings={settings} update={update} />
      <MemoSpeedRandomizationSection settings={settings} update={update} />
    </div>
  );
}

export default AdvancedPanel;
