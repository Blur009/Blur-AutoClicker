import "../advanced/sections/shared.css";
import "./ClickPointsPanel.css";
import type { Settings } from "../../../store";
import ClickPointsContent from "./ClickPointsContent";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
  running: boolean;
  activeClickPointIndex: number | null;
  activeClickPointTick: number;
}

function ClickPointsPanel({
  settings,
  update,
  showInfo,
  running,
  activeClickPointIndex,
  activeClickPointTick,
}: Props) {
  return (
    <div className="adv-panel adv-panel-text">
      <div className="adv-col">
        <ClickPointsContent
          settings={settings}
          update={update}
          showInfo={showInfo}
          running={running}
          activeClickPointIndex={activeClickPointIndex}
          activeClickPointTick={activeClickPointTick}
        />
      </div>
    </div>
  );
}

export default ClickPointsPanel;
