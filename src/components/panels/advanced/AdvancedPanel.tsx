import "./sections/shared.css";
import "./AdvancedPanel.css";
import type { Settings } from "../../../store";
import CadenceSection from "./sections/CadenceSection";
import DutyCycleSection from "./sections/DutyCycleSection";
import SpeedVariationSection from "./sections/SpeedVariationSection";
import DoubleClickSection from "./sections/DoubleClickSection";
import LimitsSection from "./sections/LimitsSection";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

function AdvancedPanel({
  settings,
  update,
  showInfo,
}: Props) {
  return (
    <div className="adv-panel adv-panel-text">
      <div className="adv-columns">
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
        </div>
      </div>
    </div>
  );
}

export default AdvancedPanel;
