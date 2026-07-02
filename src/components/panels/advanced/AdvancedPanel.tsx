import "./AdvancedPanel.css";
import type { Settings } from "../../../store";
import CadenceSection from "./sections/CadenceSection";
import DutyCycleSection from "./sections/DutyCycleSection";
import SpeedVariationSection from "./sections/SpeedVariationSection";
import DoubleClickSection from "./sections/DoubleClickSection";
import SequenceSection from "./sections/SequenceSection";
import LimitsSection from "./sections/LimitsSection";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
  running: boolean;
  activeSequenceIndex: number | null;
  activeSequenceTick: number;
}

function AdvancedPanel({
  settings,
  update,
  showInfo,
  running,
  activeSequenceIndex,
  activeSequenceTick,
}: Props) {
  const sequenceSection = (
    <SequenceSection
      settings={settings}
      update={update}
      showInfo={showInfo}
      running={running}
      activeSequenceIndex={activeSequenceIndex}
      activeSequenceTick={activeSequenceTick}
    />
  );
  const isTallLayout = settings.advancedSequenceLayout === "tall";
  return (
    <div className="adv-panel adv-panel-text">
      <div
        className={`adv-columns ${isTallLayout ? "adv-columns--tall" : "adv-columns--wide"}`}
      >
        <div className="adv-col">
          <CadenceSection
            settings={settings}
            update={update}
            showInfo={showInfo}
          />
          <DutyCycleSection
            settings={settings}
            update={update}
            showInfo={showInfo}
          />
          <LimitsSection
            settings={settings}
            update={update}
            showInfo={showInfo}
          />
          <SpeedVariationSection
            settings={settings}
            update={update}
            showInfo={showInfo}
          />
          <DoubleClickSection
            settings={settings}
            update={update}
            showInfo={showInfo}
          />
          {isTallLayout && sequenceSection}
        </div>

        {!isTallLayout && (
          <div className="adv-col adv-col--sequence">{sequenceSection}</div>
        )}
      </div>
    </div>
  );
}

export default AdvancedPanel;
