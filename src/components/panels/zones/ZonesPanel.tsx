import "../advanced/sections/shared.css";
import "./ZonesPanel.css";
import type { Settings } from "../../../store";
import FailsafeSection from "./sections/FailsafeSection";
import CustomStopZoneSection from "./sections/CustomStopZoneSection";

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
    </div>
  );
}

export default ZonesPanel;
