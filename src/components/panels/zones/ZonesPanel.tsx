import "../advanced/sections/shared.css";
import "./ZonesPanel.css";
import type { Settings } from "../../../store";
import FailsafeSection from "./sections/FailsafeSection";
import StopZonesSection from "./sections/CustomStopZoneSection";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
}

function ZonesPanel({ settings, update, showInfo }: Props) {
  return (
    <div className="adv-panel adv-panel-text adv-panel--zones">
      <div className="adv-zones-row">
        <FailsafeSection
          settings={settings}
          update={update}
          showInfo={showInfo}
        />
      </div>
      <StopZonesSection
        settings={settings}
        update={update}
        showInfo={showInfo}
      />
    </div>
  );
}

export default ZonesPanel;
