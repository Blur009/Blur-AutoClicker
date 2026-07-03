import "../advanced/sections/shared.css";
import "../advanced/AdvancedPanel.css";
import type { Settings } from "../../../store";
import SequenceSection from "../advanced/sections/SequenceSection";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  showInfo: boolean;
  running: boolean;
  activeSequenceIndex: number | null;
  activeSequenceTick: number;
}

function SequencePanel({
  settings,
  update,
  showInfo,
  running,
  activeSequenceIndex,
  activeSequenceTick,
}: Props) {
  return (
    <div className="adv-panel adv-panel-text">
      <div className="adv-columns">
        <div className="adv-col">
          <SequenceSection
            settings={settings}
            update={update}
            showInfo={showInfo}
            running={running}
            activeSequenceIndex={activeSequenceIndex}
            activeSequenceTick={activeSequenceTick}
          />
        </div>
      </div>
    </div>
  );
}

export default SequencePanel;
