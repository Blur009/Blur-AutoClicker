import "./AdvancedPanel.css";
import { useEffect, useEffectEvent } from "react";
import { getMaxDoubleClickDelayMs } from "../../../cadence";
import type { Settings } from "../../../store";
import CadenceSection from "./CadenceSection";
import DutyCycleSection from "./DutyCycleSection";
import SpeedVariationSection from "./SpeedVariationSection";
import DoubleClickSection from "./DoubleClickSection";
import SequenceSection from "./SequenceSection";
import LimitsSection from "./LimitsSection";
import FailsafeSection from "./FailsafeSection";
import PositionSection from "./PositionSection";
import CustomStopZoneSection from "./CustomStopZoneSection";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  onPickPosition: () => Promise<void>;
  showInfo: boolean;
}

export default function AdvancedPanel({
  settings,
  update,
  onPickPosition,
  showInfo,
}: Props) {
  const {
    clickInterval,
    clickSpeed,
    doubleClickDelay,
    durationMilliseconds,
    durationMinutes,
    durationSeconds,
    rateInputMode,
  } = settings;
  const clampDoubleClickDelay = useEffectEvent((maxDelay: number) => {
    update({ doubleClickDelay: maxDelay });
  });

  useEffect(() => {
    const max = getMaxDoubleClickDelayMs({
      clickInterval,
      clickSpeed,
      rateInputMode,
      durationMinutes,
      durationSeconds,
      durationMilliseconds,
    });
    if (doubleClickDelay > max) {
      clampDoubleClickDelay(max);
    }
  }, [
    clickInterval,
    clickSpeed,
    doubleClickDelay,
    durationMilliseconds,
    durationMinutes,
    durationSeconds,
    rateInputMode,
  ]);

  return (
    <div className="adv-panel adv-panel-text">
      <div className="adv-columns">
        <div className="adv-col">
          <CadenceSection settings={settings} update={update} showInfo={showInfo} />
          <DutyCycleSection settings={settings} update={update} showInfo={showInfo} />
          <SpeedVariationSection settings={settings} update={update} showInfo={showInfo} />
          <DoubleClickSection settings={settings} update={update} showInfo={showInfo} />
          <SequenceSection settings={settings} update={update} showInfo={showInfo} />
        </div>

        <div className="adv-col">
          <LimitsSection settings={settings} update={update} showInfo={showInfo} />
          <FailsafeSection settings={settings} update={update} showInfo={showInfo} />
          <PositionSection settings={settings} update={update} showInfo={showInfo} onPickPosition={onPickPosition} />
          <CustomStopZoneSection settings={settings} update={update} showInfo={showInfo} />
        </div>
      </div>
    </div>
  );
}