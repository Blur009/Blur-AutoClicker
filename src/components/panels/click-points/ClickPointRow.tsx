import { type CSSProperties } from "react";
import type { ClickPoint } from "../../../store";
import { NumInput } from "../advanced/sections/shared";

interface Props {
  point: ClickPoint;
  index: number;
  isActive: boolean;
  isDragging: boolean;
  activeTick: number;
  stepDurationMs: number;
  onUpdate: (index: number, patch: Partial<ClickPoint>) => void;
  onDelete: (index: number) => void;
  onDragStart: (
    pointId: string,
    pointerId: number,
    handle: HTMLButtonElement,
    clientY: number,
  ) => void;
  setItemRef: (pointId: string, node: HTMLDivElement | null) => void;
}

export default function ClickPointRow({
  point,
  index,
  isActive,
  isDragging,
  activeTick,
  stepDurationMs,
  onUpdate,
  onDelete,
  onDragStart,
  setItemRef,
}: Props) {
  return (
    <div
      key={point.id}
      ref={(node) => setItemRef(point.id, node)}
      className={`adv-click-points-item ${
        isDragging ? "adv-click-points-item--dragging" : ""
      } ${isActive ? "adv-click-points-item--active" : ""}`}
      style={
        isActive
          ? ({
              "--click-points-step-duration": `${stepDurationMs}ms`,
              "--click-points-step-clicks": point.clicks,
            } as CSSProperties)
          : undefined
      }
    >
      {isActive ? (
        <span key={activeTick} className="adv-click-points-progress" />
      ) : null}
      <div className="adv-click-points-leading">
        <span className="adv-click-points-index">{index + 1}</span>
        <button
          type="button"
          className="adv-click-points-drag-handle"
          aria-label="Up / Down"
          onPointerDown={(event) => {
            event.preventDefault();
            const handle = event.currentTarget;
            handle.setPointerCapture(event.pointerId);
            onDragStart(point.id, event.pointerId, handle, event.clientY);
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M2 3H10M2 6H10M2 9H10"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <label
        className="adv-numbox-sm adv-click-points-coord adv-click-points-position"
        style={{ gap: "0.25rem" }}
      >
        <span
          className="adv-unit"
          style={{
            minWidth: "0.125rem",
            textAlign: "center",
          }}
        >
          X
        </span>
        <NumInput
          hoverWheel={false}
          value={point.x}
          onChange={(value) => onUpdate(index, { x: value })}
          style={{
            flex: 1,
            width: "100%",
            textAlign: "right",
          }}
        />
      </label>
      <label
        className="adv-numbox-sm adv-click-points-coord adv-click-points-position"
        style={{ gap: "0.25rem" }}
      >
        <span
          className="adv-unit"
          style={{
            minWidth: "0.125rem",
            textAlign: "left",
          }}
        >
          Y
        </span>
        <NumInput
          hoverWheel={false}
          value={point.y}
          onChange={(value) => onUpdate(index, { y: value })}
          style={{
            flex: 1,
            width: "100%",
            textAlign: "right",
          }}
        />
      </label>
      <label
        className="adv-numbox-sm adv-click-points-coord adv-click-points-clicks"
        style={{ gap: "0.25rem" }}
      >
        <span
          className="adv-unit"
          style={{ minWidth: "0.75rem", textAlign: "left" }}
        >
          clicks
        </span>
        <NumInput
          hoverWheel={false}
          value={point.clicks}
          min={1}
          max={100000}
          onChange={(value) => onUpdate(index, { clicks: value })}
          style={{
            flex: 1,
            width: "100%",
            textAlign: "right",
          }}
        />
      </label>
      <div className="adv-click-points-actions">
        <button
          type="button"
          className="adv-click-points-delete"
          onClick={() => onDelete(index)}
          aria-label="Delete"
          title="Delete"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M2.5 3.5H9.5M4.25 3.5V2.75C4.25 2.34 4.59 2 5 2H7C7.41 2 7.75 2.34 7.75 2.75V3.5M8.75 3.5V9C8.75 9.55 8.3 10 7.75 10H4.25C3.7 10 3.25 9.55 3.25 9V3.5M5 5.25V8.25M7 5.25V8.25"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
