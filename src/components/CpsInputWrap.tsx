import type { ReactNode } from "react";
import { FlameWrap } from "./canvasui/FlameWrap";
import "./CpsInputWrap.css";

const FLAME_COLOR_HEX = "#808080";
const FLAME_COLOR_RGB: [number, number, number] = [
  Number.parseInt(FLAME_COLOR_HEX.slice(1, 3), 16) / 255,
  Number.parseInt(FLAME_COLOR_HEX.slice(3, 5), 16) / 255,
  Number.parseInt(FLAME_COLOR_HEX.slice(5, 7), 16) / 255,
];

const HIGH_CPS_WARNING =
  "High click speeds can increase CPU usage, flood the input queue, become inaccurate, or make the target application unresponsive.";

export function CpsInputWrap({ children }: { children: ReactNode }) {
  return (
    <FlameWrap className="cps-flame-wrap" color={FLAME_COLOR_RGB}>
      {children}
    </FlameWrap>
  );
}

export function HighCpsWarning({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span
        className="cps-warning-icon"
        role="status"
        aria-label={HIGH_CPS_WARNING}
        title={HIGH_CPS_WARNING}
      >
        ⚠
      </span>
    );
  }

  return (
    <div className="cps-warning-message" role="status">
      <span aria-hidden="true">⚠</span>
      <span>{HIGH_CPS_WARNING}</span>
    </div>
  );
}
