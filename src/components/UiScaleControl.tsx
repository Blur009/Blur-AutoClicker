import "./UiScaleControl.css";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  UI_SCALE_DEFAULT,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
} from "../settingsSchema";
import { formatUiScale, stepUiScale } from "../uiScale";

interface Props {
  scale: number;
  onChange: (next: number) => void;
  className?: string;
}

const STEP_HINT = "10% per click, 25% with Shift, 50% with Ctrl+Shift";

export default function UiScaleControl({ scale, onChange, className }: Props) {
  const adjust = (direction: 1 | -1) => (event: ReactMouseEvent) => {
    onChange(
      stepUiScale(scale, direction, {
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
      }),
    );
  };

  return (
    <div className={className ? `ui-scale ${className}` : "ui-scale"}>
      <button
        type="button"
        className="ui-scale-btn"
        onClick={adjust(-1)}
        disabled={scale <= UI_SCALE_MIN}
        title={`Smaller: ${STEP_HINT}`}
        aria-label="Decrease interface scale"
      >
        &minus;
      </button>
      <button
        type="button"
        className="ui-scale-value"
        onClick={() => onChange(UI_SCALE_DEFAULT)}
        title={`Interface scale: ${STEP_HINT}. Click to reset to 100%.`}
        aria-label={`Interface scale ${formatUiScale(scale)}. Reset to 100%`}
      >
        {formatUiScale(scale)}
      </button>
      <button
        type="button"
        className="ui-scale-btn"
        onClick={adjust(1)}
        disabled={scale >= UI_SCALE_MAX}
        title={`Larger: ${STEP_HINT}`}
        aria-label="Increase interface scale"
      >
        +
      </button>
    </div>
  );
}
