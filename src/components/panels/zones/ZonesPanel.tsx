import "./ZonesPanel.css";
import type { Settings } from "../../../store";
import FailsafeSection from "./sections/FailsafeSection";
import CustomStopZoneSection from "./sections/CustomStopZoneSection";
import ProcessListSection from "./sections/ProcessListSection";

// TODO: This still entirely needs to get done. I've just moved everything over here. If you are a back end dev, please be careful changing UI things xD
// TODO: Custom Stop zones should be like Sequence clicking where you can add as many as you want in a list.

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

function ZonesPanel({ settings, update, showInfo }: Props) {
  return (
    <div className="adv-panel adv-panel-text adv-panel--zones">
      <div className="adv-zones-row">
        <div className="adv-zones-left">
          <FailsafeSection
            settings={settings}
            update={update}
            showInfo={showInfo}
          />
        </div>
        <div className="adv-zones-right">
          <CustomStopZoneSection
            settings={settings}
            update={update}
            showInfo={showInfo}
          />
        </div>
      </div>
      <div className="adv-row adv-row--grow">
        <ProcessListSection
          settings={settings}
          update={update}
          showInfo={showInfo}
        />
      </div>
    </div>
  );
}

export default ZonesPanel;
