import "../advanced/AdvancedPanel.css";
import type { Settings } from "../../../store";
import FailsafeSection from "./FailsafeSection";
import CustomStopZoneSection from "./CustomStopZoneSection";

// TODO: This still entirely needs to get done. I've just moved everything over here. If you are a back end dev, please be careful changing UI things xD
// TODO: Custom Stop zones should be like Sequence clicking where you can add as many as you want in a list.

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

export default function ZonesPanel({ settings, update, showInfo }: Props) {
  return (
    <div className="adv-panel adv-panel-text">
      <div className="adv-row">
        <FailsafeSection
          settings={settings}
          update={update}
          showInfo={showInfo}
        />
      </div>
      <div className="adv-columns">
        <div className="adv-col">
          <CustomStopZoneSection
            settings={settings}
            update={update}
            showInfo={showInfo}
          />
        </div>
      </div>
    </div>
  );
}
